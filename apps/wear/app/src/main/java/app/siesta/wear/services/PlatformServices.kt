package app.siesta.wear.services

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import androidx.core.app.NotificationCompat
import androidx.health.services.client.ExerciseClient
import androidx.health.services.client.ExerciseUpdateCallback
import androidx.health.services.client.HealthServices
import androidx.health.services.client.data.Availability
import androidx.health.services.client.data.DataType
import androidx.health.services.client.data.ExerciseConfig
import androidx.health.services.client.data.ExerciseType
import androidx.health.services.client.data.ExerciseUpdate
import androidx.health.services.client.endExercise
import androidx.health.services.client.startExercise
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import siesta.AlarmKind
import siesta.AlarmScheduler
import siesta.EpochMs
import siesta.HapticService
import siesta.NapSessionSnapshot
import siesta.PhysioSample
import siesta.SessionStore
import siesta.SleepDetectionService
import siesta.SleepOnsetDetector
import siesta.WakePattern
import siesta.WakeStep
import siesta.patternDurationMs

// MARK: - Persistence

private const val PREFS = "siesta"
private const val SESSION_KEY = "siesta.session.v1"

/**
 * SharedPreferences — survives process death. Watch Connectivity / DataClient
 * sync to the phone companion is a deliberate follow-up.
 */
class PreferencesSessionStore(context: Context) : SessionStore {
    private val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    private val json = Json { ignoreUnknownKeys = true }

    override fun load(): NapSessionSnapshot? {
        val stored = prefs.getString(SESSION_KEY, null)
        val snapshot = stored?.let {
            runCatching { json.decodeFromString<NapSessionSnapshot>(it) }.getOrNull()
        }
        ProbeLog.log("snapshot_load", mapOf(
            "found" to (snapshot != null),
            "state" to (snapshot?.state?.name ?: "none"),
        ))
        return snapshot
    }

    override fun save(session: NapSessionSnapshot) {
        prefs.edit().putString(SESSION_KEY, json.encodeToString(session)).apply()
        ProbeLog.log("snapshot_save", mapOf("state" to session.state.name))
    }

    override fun clear() {
        prefs.edit().remove(SESSION_KEY).apply()
        ProbeLog.log("snapshot_clear")
    }
}

// MARK: - Scheduled wake

private const val CHANNEL_ID = "siesta"
private const val EXTRA_KIND = "kind"
private const val EXTRA_SESSION = "session"
private const val EXTRA_AT = "atMs"
private const val ACTION_WAKE = "app.siesta.wear.WAKE"

/**
 * AlarmManager exact alarms are the durable scheduled-wake channel — they
 * fire even while the app sleeps and still run WakeReceiver after a process
 * kill. Delivery posts a notification; the running exercise session also
 * drives in-app haptics for foreground wakes.
 */
class AlarmSchedulerService(private val context: Context) : AlarmScheduler {

    private val alarmManager = context.getSystemService(AlarmManager::class.java)

    init {
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Siesta",
            NotificationManager.IMPORTANCE_HIGH,
        ).apply { enableVibration(true) }
        context.getSystemService(NotificationManager::class.java)
            ?.createNotificationChannel(channel)
    }

    override fun schedule(atMs: EpochMs, kind: AlarmKind, sessionId: String) {
        // An exact alarm that cannot be scheduled is not a wake channel —
        // canScheduleExactAlarms is the first thing the probe checks.
        val canExact = Build.VERSION.SDK_INT < 31 ||
            alarmManager?.canScheduleExactAlarms() == true
        val intent = Intent(context, WakeReceiver::class.java)
            .setAction(ACTION_WAKE)
            .putExtra(EXTRA_KIND, kind.name.lowercase())
            .putExtra(EXTRA_SESSION, sessionId)
            .putExtra(EXTRA_AT, atMs)
        val pending = PendingIntent.getBroadcast(
            context, kind.ordinal, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        ProbeLog.log("alarm_scheduled", mapOf(
            "kind" to kind.name.lowercase(),
            "atMs" to atMs,
            "canExact" to canExact,
        ))
        if (canExact) {
            alarmManager?.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMs, pending)
        } else {
            // Degraded-but-honest fallback: inexact alarm still wakes, just
            // late. The probe report surfaces canExact=false per nap.
            alarmManager?.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMs, pending)
        }
    }

    override fun cancelAll() {
        val alarm = alarmManager ?: return
        AlarmKind.entries.forEach { kind ->
            val pending = PendingIntent.getBroadcast(
                context, kind.ordinal,
                Intent(context, WakeReceiver::class.java).setAction(ACTION_WAKE),
                PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE,
            )
            pending?.let { alarm.cancel(it) }
        }
        ProbeLog.log("alarm_cancelled")
    }
}

class WakeReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ACTION_WAKE) return
        ProbeLog.init(context)
        val kind = intent.getStringExtra(EXTRA_KIND)
        val atMs = intent.getLongExtra(EXTRA_AT, 0L)
        ProbeLog.log("alarm_delivered", buildMap {
            put("kind", kind)
            if (atMs > 0) put("lateMs", System.currentTimeMillis() - atMs)
            putAll(ProbeEnv.capture(context))
        })

        val body = if (kind == AlarmKind.NAP_WAKE.name.lowercase()) {
            "Your siesta is over."
        } else {
            "Couldn't detect sleep — waking you now."
        }
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("Siesta")
            .setContentText(body)
            .setAutoCancel(true)
            .build()
        context.getSystemService(NotificationManager::class.java)
            ?.notify(kind.hashCode(), notification)
        @Suppress("DEPRECATION")
        context.getSystemService(Vibrator::class.java)
            ?.vibrate(VibrationEffect.createOneShot(400, VibrationEffect.DEFAULT_AMPLITUDE))
    }
}

// MARK: - Haptics

/**
 * WakePattern steps map to vibrator amplitudes — the same rhythm the watch
 * plays through WKHapticType. A SupervisorJob so one cancel doesn't kill
 * the scope for future plays.
 */
class WearHaptics(context: Context) : HapticService {
    @Suppress("DEPRECATION")
    private val vibrator = context.getSystemService(Vibrator::class.java)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private var playing: kotlinx.coroutines.Job? = null

    override fun playWake(pattern: WakePattern) {
        playing?.cancel()
        ProbeLog.log("haptic_start", mapOf(
            "steps" to pattern.steps.size,
            "repeatIntervalMs" to pattern.repeatIntervalMs,
        ))
        playing = scope.launch {
            while (isActive) {
                for (step in pattern.steps) {
                    if (!isActive) return@launch
                    when (step) {
                        is WakeStep.Pulse -> {
                            vibrate(step.intensity, step.durationMs)
                            delay(step.durationMs)
                        }
                        is WakeStep.Pause -> delay(step.durationMs)
                    }
                }
                delay(maxOf(0L, pattern.repeatIntervalMs - patternDurationMs(pattern)))
            }
        }
    }

    override fun stop() {
        ProbeLog.log("haptic_stop")
        playing?.cancel()
        playing = null
        vibrator?.cancel()
    }

    private fun vibrate(intensity: Double, durationMs: Long) {
        val amplitude = (intensity * 255).toInt().coerceIn(1, 255)
        vibrator?.vibrate(
            VibrationEffect.createOneShot(maxOf(durationMs, 20), amplitude),
        )
    }
}

// MARK: - Sleep detection

/**
 * Health Services exercise session keeps the CPU alive and streams heart
 * rate for the whole nap — Wear OS has no real-time sleep API either, so
 * the shared SleepOnsetDetector heuristic runs on those samples.
 * Same honesty bar as watchOS: heuristic, not medical.
 *
 * Probe: every sample, gap, availability change, and exercise-state change
 * is logged — cadence is the answer to "how quickly can it know".
 */
class HealthServicesSleepDetector(private val context: Context) : SleepDetectionService {

    private val client: ExerciseClient = HealthServices.getClient(context).exerciseClient
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private var detector = SleepOnsetDetector()
    private var listeners = mutableMapOf<Int, (EpochMs) -> Unit>()
    private var nextId = 0
    private var exercising = false
    private var lastSampleAtMs: EpochMs? = null

    private val callback = object : ExerciseUpdateCallback {
        override fun onRegistered() {
            ProbeLog.log("exercise_registered")
        }

        override fun onRegistrationFailed(throwable: Throwable) {
            ProbeLog.log("exercise_registration_failed", mapOf(
                "error" to (throwable.message ?: throwable.javaClass.simpleName),
            ))
        }

        override fun onExerciseUpdateReceived(update: ExerciseUpdate) {
            ProbeLog.log("exercise_state", mapOf(
                "state" to update.exerciseStateInfo.state.name,
            ))
            val hr = update.latestMetrics.getData(DataType.HEART_RATE_BPM)
            hr.lastOrNull()?.let { point ->
                val now = System.currentTimeMillis()
                lastSampleAtMs?.let { last ->
                    if (now - last > 10_000) {
                        ProbeLog.log("hr_gap", mapOf("gapMs" to (now - last)))
                    }
                }
                lastSampleAtMs = now
                ProbeLog.log("hr_sample", mapOf("bpm" to point.value.toInt()))
                detector.feed(PhysioSample(atMs = now, heartRate = point.value))
            }
            detector.onsetAtMs?.let { onset ->
                ProbeLog.log("onset", mapOf("atMs" to onset, "mode" to "exercise_client"))
                detector.reset()
                listeners.values.forEach { it(onset) }
            }
        }

        override fun onAvailabilityChanged(
            dataType: DataType<*, *>,
            availability: Availability,
        ) {
            ProbeLog.log("hr_availability", mapOf(
                "dataType" to dataType.name,
                "availability" to availability.toString(),
            ))
        }

        override fun onLapSummaryReceived(
            lapSummary: androidx.health.services.client.data.ExerciseLapSummary,
        ) = Unit
    }

    override suspend fun start() {
        ProbeLog.init(context)
        ProbeLog.log("detector_start", buildMap {
            put("mode", "exercise_client")
            putAll(ProbeEnv.capture(context))
        })
        val config = ExerciseConfig.builder(ExerciseType.MEDITATION)
            .setDataTypes(setOf(DataType.HEART_RATE_BPM))
            .setIsAutoPauseAndResumeEnabled(false)
            .setIsGpsEnabled(false)
            .build()
        client.setUpdateCallback(callback)
        client.startExercise(config)
        exercising = true
        detector = SleepOnsetDetector()
        lastSampleAtMs = null
    }

    /** Dev-only Phase-4 hook: fires listeners as if real detection ran. */
    fun debugSimulateSleep(atMs: EpochMs) {
        if (listeners.isEmpty()) return
        ProbeLog.log("onset", mapOf("atMs" to atMs, "mode" to "exercise_client", "simulated" to true))
        listeners.values.forEach { it(atMs) }
    }

    override fun stop() {
        ProbeLog.log("detector_stop", mapOf("mode" to "exercise_client"))
        if (exercising) {
            exercising = false
            scope.launch { runCatching { client.endExercise() } }
        }
        detector.reset()
        ProbeLog.flush()
    }

    override fun onSleepDetected(callback: (EpochMs) -> Unit): () -> Unit {
        val id = nextId++
        listeners[id] = callback
        return { listeners.remove(id) }
    }
}
