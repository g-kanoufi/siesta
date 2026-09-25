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
class SessionViewModel(context: Context) : ViewModel() {

    private val appContext = context.applicationContext

    private var manager: NapSessionManager? = null
    private var unsubscribe: (() -> Unit)? = null
    private var lastLoggedState: NapState? = null
    private var monitorRunning = false
    private var sleep: HealthServicesSleepDetector? = null

    private val _view = MutableStateFlow<NapViewState?>(null)
    val view: StateFlow<NapViewState?> = _view.asStateFlow()

    private val _ready = MutableStateFlow(false)
    val ready: StateFlow<Boolean> = _ready.asStateFlow()

    private val _selectedMinutes = MutableStateFlow(20)
    val selectedMinutes: StateFlow<Int> = _selectedMinutes.asStateFlow()

    private val _showProbe = MutableStateFlow(false)
    val showProbe: StateFlow<Boolean> = _showProbe.asStateFlow()

    init {
        ProbeLog.init(appContext)
        ProbeLog.log("boot", ProbeEnv.capture(appContext))
        viewModelScope.launch {
            sleep = HealthServicesSleepDetector(appContext)
            val m = NapSessionManager.resume(
                clock = SystemClock,
                sleep = sleep!!,
                scheduler = AlarmSchedulerService(appContext),
                haptics = WearHaptics(appContext),
                store = PreferencesSessionStore(appContext),
                wakeIntensity = WakeIntensity.NORMAL,
            )
            manager = m
            ProbeLog.sessionId = m.snapshot?.id
            unsubscribe = m.subscribe { refresh() }
            refresh()
            _ready.value = true
            // 1 Hz countdown tick — re-reads timestamp-derived state only.
            while (isActive) {
                delay(1000)
                m.tick()
                refresh()
            }
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

    fun begin() {
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
