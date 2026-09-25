package siesta

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** Port of packages/core/src/machine.ts — keep transitions identical.
 *  @SerialName pins the wire format to the shared vectors. */
@Serializable
enum class NapState {
    @SerialName("idle") IDLE,
    @SerialName("selecting_duration") SELECTING_DURATION,
    @SerialName("armed") ARMED,
    @SerialName("waiting_for_sleep") WAITING_FOR_SLEEP,
    @SerialName("sleeping") SLEEPING,
    @SerialName("waking") WAKING,
    @SerialName("completed") COMPLETED,
    @SerialName("cancelled") CANCELLED,
    @SerialName("error") ERROR;

    companion object {
        fun fromWire(wire: String): NapState = entries.first { it.name.lowercase() == wire }
    }
}

sealed interface NapEvent {
    data class DurationSelected(val minutes: Int) : NapEvent
    data object Start : NapEvent
    data object DetectorReady : NapEvent
    data class SleepDetected(val atMs: Long) : NapEvent
    data object WakeDue : NapEvent
    data object WakeAcknowledged : NapEvent
    data object Cancel : NapEvent
    data class Error(val reason: String) : NapEvent
    data object Reset : NapEvent
}

val initialNapState: NapState = NapState.IDLE

/** Pure, total transition. Unknown pairs are no-ops — async platform events
 *  can arrive late and must never corrupt the session. */
fun transition(state: NapState, event: NapEvent): NapState = when (state) {
    NapState.IDLE -> when (event) {
        is NapEvent.DurationSelected -> NapState.SELECTING_DURATION
        else -> state
    }
    NapState.SELECTING_DURATION -> when (event) {
        is NapEvent.DurationSelected -> NapState.SELECTING_DURATION
        NapEvent.Start -> NapState.ARMED
        NapEvent.Cancel -> NapState.IDLE
        else -> state
    }
    NapState.ARMED -> when (event) {
        NapEvent.DetectorReady -> NapState.WAITING_FOR_SLEEP
        is NapEvent.SleepDetected -> NapState.SLEEPING
        NapEvent.Cancel -> NapState.CANCELLED
        is NapEvent.Error -> NapState.ERROR
        else -> state
    }
    NapState.WAITING_FOR_SLEEP -> when (event) {
        is NapEvent.SleepDetected -> NapState.SLEEPING
        NapEvent.WakeDue -> NapState.WAKING
        NapEvent.Cancel -> NapState.CANCELLED
        is NapEvent.Error -> NapState.ERROR
        else -> state
    }
    NapState.SLEEPING -> when (event) {
        NapEvent.WakeDue -> NapState.WAKING
        NapEvent.Cancel -> NapState.CANCELLED
        is NapEvent.Error -> NapState.ERROR
        else -> state
    }
    NapState.WAKING -> when (event) {
        NapEvent.WakeAcknowledged, NapEvent.Cancel -> NapState.COMPLETED
        else -> state
    }
    NapState.COMPLETED, NapState.CANCELLED, NapState.ERROR -> when (event) {
        NapEvent.Reset -> NapState.IDLE
        else -> state
    }
}
