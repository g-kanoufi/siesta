package siesta

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

fun interface Clock {
    fun nowMs(): EpochMs
}

object SystemClock : Clock {
    override fun nowMs(): EpochMs = System.currentTimeMillis()
}

/**
 * Platform boundary — implementations wrap Health Services,
 * AlarmManager/notification, and Vibrator. Only `start` suspends:
 * permission/service bind is genuinely async; everything else maps to
 * synchronous platform calls, keeping the manager deterministic.
 */
interface SleepDetectionService {
    suspend fun start()
    fun stop()
    /** Returns an unsubscribe lambda. */
    fun onSleepDetected(callback: (EpochMs) -> Unit): () -> Unit
}

@Serializable
enum class AlarmKind {
    @SerialName("nap_wake") NAP_WAKE,
    @SerialName("fail_safe") FAIL_SAFE,
}

interface AlarmScheduler {
    fun schedule(atMs: EpochMs, kind: AlarmKind, sessionId: String)
    fun cancelAll()
}

interface HapticService {
    fun playWake(pattern: WakePattern)
    fun stop()
}

interface SessionStore {
    fun load(): NapSessionSnapshot?
    fun save(session: NapSessionSnapshot)
    fun clear()
}
