package siesta

import kotlinx.serialization.Serializable

typealias EpochMs = Long

const val MINUTE_MS: Long = 60_000
const val DEFAULT_FAIL_SAFE_GRACE_MINUTES = 15

/** Epoch-ms arithmetic: "20 minutes" is 20 elapsed minutes regardless of
 *  midnight, DST transitions, or timezone changes. */
fun computeWakeAtMs(sleepDetectedAtMs: EpochMs, durationMinutes: Int): EpochMs =
    sleepDetectedAtMs + durationMinutes.toLong() * MINUTE_MS

fun computeFailSafeWakeAtMs(
    armedAtMs: EpochMs,
    durationMinutes: Int,
    graceMinutes: Int = DEFAULT_FAIL_SAFE_GRACE_MINUTES,
): EpochMs = armedAtMs + (durationMinutes + graceMinutes).toLong() * MINUTE_MS

/** The persisted nap session — same shape as NapSessionSnapshot in core. */
@Serializable
data class NapSessionSnapshot(
    val id: String,
    val selectedDurationMinutes: Int,
    var state: NapState = NapState.IDLE,
    val armedAtMs: EpochMs? = null,
    val sleepDetectedAtMs: EpochMs? = null,
    val expectedWakeAtMs: EpochMs? = null,
    /** armedAt + duration + grace — the latest the user can possibly sleep. */
    val failSafeWakeAtMs: EpochMs? = null,
)

/** The next deadline that can move the session into `waking`. */
fun nextDeadlineMs(s: NapSessionSnapshot): EpochMs? = when (s.state) {
    NapState.WAITING_FOR_SLEEP -> s.failSafeWakeAtMs
    NapState.SLEEPING -> s.expectedWakeAtMs
    else -> null
}

/** Countdown for the sleeping state. Clamped at 0; null when no deadline. */
fun remainingMs(s: NapSessionSnapshot, nowMs: EpochMs): Long? {
    val deadline = nextDeadlineMs(s) ?: return null
    return maxOf(0L, deadline - nowMs)
}
