package app.siesta.wear

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.siesta.wear.services.AlarmSchedulerService
import app.siesta.wear.services.HealthServicesSleepDetector
import app.siesta.wear.services.NapMonitorService
import app.siesta.wear.services.PreferencesSessionStore
import app.siesta.wear.services.ProbeEnv
import app.siesta.wear.services.ProbeLog
import app.siesta.wear.services.WearHaptics
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import siesta.NapSessionManager
import siesta.NapState
import siesta.NapViewState
import siesta.SystemClock
import siesta.WakeIntensity

/**
 * Mirrors the watchOS SessionViewModel: a StateFlow of NapViewState driven by
 * the domain manager's subscription, plus a 1 Hz tick while sleeping.
 * Deadlines are timestamp-derived — the tick only re-reads the clock.
 *
 * Probe: owns session-level events — state transitions, the foreground
 * service that keeps the process alive while armed, and probe config.
 */
private const val PREFS_NAME = "siesta"
private const val INTENSITY_KEY = "siesta.wakeIntensity"
private const val ONBOARD_KEY = "siesta.didOnboard"
private const val SLEEP_ACCESS_KEY = "siesta.didExplainSleepAccess"

class SessionViewModel(context: Context) : ViewModel() {

    private val appContext = context.applicationContext

    private var manager: NapSessionManager? = null
    private var unsubscribe: (() -> Unit)? = null
    private var lastLoggedState: NapState? = null
    private var monitorRunning = false
    private var sleep: HealthServicesSleepDetector? = null
    private val prefs = appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    private val _wakeIntensity = MutableStateFlow(WakeIntensity.GENTLE)
    val wakeIntensity: StateFlow<WakeIntensity> = _wakeIntensity.asStateFlow()

    private val _view = MutableStateFlow<NapViewState?>(null)
    val view: StateFlow<NapViewState?> = _view.asStateFlow()

    private val _ready = MutableStateFlow(false)
    val ready: StateFlow<Boolean> = _ready.asStateFlow()

    private val _selectedMinutes = MutableStateFlow(20)
    val selectedMinutes: StateFlow<Int> = _selectedMinutes.asStateFlow()

    private val _showProbe = MutableStateFlow(false)
    val showProbe: StateFlow<Boolean> = _showProbe.asStateFlow()

    private val _didOnboard = MutableStateFlow(false)
    val didOnboard: StateFlow<Boolean> = _didOnboard.asStateFlow()

    private val _showSleepAccessPrompt = MutableStateFlow(false)
    val showSleepAccessPrompt: StateFlow<Boolean> = _showSleepAccessPrompt.asStateFlow()

    init {
        ProbeLog.init(appContext)
        ProbeLog.log("boot", ProbeEnv.capture(appContext))
        _wakeIntensity.value = loadWakeIntensity()
        _didOnboard.value = prefs.getBoolean(ONBOARD_KEY, false)
        viewModelScope.launch {
            manager = buildManager()
            ProbeLog.sessionId = manager?.snapshot?.id
            unsubscribe = manager?.subscribe { refresh() }
            refresh()
            _ready.value = true
            // 1 Hz countdown tick — re-reads timestamp-derived state only.
            while (isActive) {
                delay(1000)
                manager?.tick()
                refresh()
            }
        }
    }

    private suspend fun buildManager(): NapSessionManager {
        val sleepService = sleep ?: HealthServicesSleepDetector(appContext).also { sleep = it }
        return NapSessionManager.resume(
            clock = SystemClock,
            sleep = sleepService,
            scheduler = AlarmSchedulerService(appContext),
            haptics = WearHaptics(appContext),
            store = PreferencesSessionStore(appContext),
            wakeIntensity = _wakeIntensity.value,
        )
    }

    private fun loadWakeIntensity(): WakeIntensity =
        prefs.getString(INTENSITY_KEY, null)
            ?.let { runCatching { WakeIntensity.valueOf(it) }.getOrNull() }
            ?: WakeIntensity.GENTLE

    /** Gentle → Normal → Strong. Persisted; applied immediately by rebuilding
     *  the manager — only callable while no nap is in flight. */
    fun cycleWakeIntensity() {
        val all = WakeIntensity.entries
        val next = all[(_wakeIntensity.value.ordinal + 1) % all.size]
        _wakeIntensity.value = next
        prefs.edit().putString(INTENSITY_KEY, next.name).apply()
        ProbeLog.log("wake_intensity", mapOf("value" to next.name))
        viewModelScope.launch {
            unsubscribe?.invoke()
            unsubscribe = null
            manager = buildManager()
            ProbeLog.sessionId = manager?.snapshot?.id
            unsubscribe = manager?.subscribe { refresh() }
            refresh()
        }
    }

    private fun refresh() {
        _view.value = manager?.view()
        logTransitionIfChanged()
    }

    private fun logTransitionIfChanged() {
        val state = _view.value?.state ?: return
        if (state == lastLoggedState) return
        ProbeLog.log("session_state", buildMap {
            put("from", lastLoggedState?.name ?: "none")
            put("to", state.name)
            putAll(ProbeEnv.capture(appContext))
        })
        lastLoggedState = state
        ProbeLog.sessionId = manager?.snapshot?.id

        // The foreground service is what keeps this process (and therefore
        // the Health Services callback) alive while the user is away.
        val wantsMonitor = state == NapState.ARMED ||
            state == NapState.WAITING_FOR_SLEEP || state == NapState.SLEEPING
        if (wantsMonitor && !monitorRunning) {
            monitorRunning = true
            NapMonitorService.start(appContext)
        } else if (!wantsMonitor && monitorRunning) {
            monitorRunning = false
            NapMonitorService.stop(appContext)
        }
        if (state == NapState.IDLE) ProbeLog.flush()
    }

    /** DEBUG-only: skips real detection so wake/haptic/kill tests need no sleep. */
    fun simulateSleep() {
        sleep?.debugSimulateSleep(System.currentTimeMillis())
    }

    fun selectDuration(minutes: Int) {
        _selectedMinutes.value = minutes
        ProbeLog.log("select", mapOf("minutes" to minutes))
        manager?.selectDuration(minutes)
        refresh()
    }

    fun completeOnboarding() {
        _didOnboard.value = true
        prefs.edit().putBoolean(ONBOARD_KEY, true).apply()
    }

    fun begin() {
        // First arm: explain why before the runtime permission sheet (§47).
        if (!prefs.getBoolean(SLEEP_ACCESS_KEY, false)) {
            _showSleepAccessPrompt.value = true
            return
        }
        arm()
    }

    fun confirmSleepAccess() {
        prefs.edit().putBoolean(SLEEP_ACCESS_KEY, true).apply()
        _showSleepAccessPrompt.value = false
        arm()
    }

    private fun arm() {
        ProbeLog.log("arm_begin", mapOf("minutes" to _selectedMinutes.value))
        manager?.selectDuration(_selectedMinutes.value)
        viewModelScope.launch { manager?.start() }
    }

    fun beginManually() {
        ProbeLog.log("arm_begin", mapOf(
            "minutes" to _selectedMinutes.value,
            "manual" to true,
        ))
        manager?.selectDuration(_selectedMinutes.value)
        manager?.startManually()
        refresh()
    }

    fun cancel() {
        manager?.cancel()
        manager?.dismiss()
        refresh()
    }

    fun acknowledgeWake() {
        ProbeLog.log("wake_ack")
        manager?.acknowledgeWake()
        manager?.dismiss()
        refresh()
    }

    fun setShowProbe(show: Boolean) {
        _showProbe.value = show
    }

    override fun onCleared() {
        unsubscribe?.invoke()
    }
}
