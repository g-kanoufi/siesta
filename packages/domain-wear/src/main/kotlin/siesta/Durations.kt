package siesta

import kotlinx.serialization.Serializable

const val MIN_NAP_MINUTES = 5
const val MAX_NAP_MINUTES = 120
const val DEFAULT_DURATION_MINUTES = 20

@Serializable
data class NapDurationPreset(
    val minutes: Int,
    val id: String,
    val shortLabel: String,
    val description: String,
    val recommended: Boolean? = null,
)

/** Mirrors NAP_DURATION_PRESETS in @siesta/core — pinned by constants.json. */
val napDurationPresets: List<NapDurationPreset> = listOf(
    NapDurationPreset(10, "quick-reset", "10 min", "Quick reset"),
    NapDurationPreset(15, "short-break", "15 min", "Short break"),
    NapDurationPreset(20, "power-nap", "20 min", "Classic power nap", recommended = true),
    NapDurationPreset(25, "extended-rest", "25 min", "Extended rest"),
    NapDurationPreset(30, "longer-recharge", "30 min", "Longer recharge"),
    NapDurationPreset(45, "deep-rest", "45 min", "Deep rest"),
    NapDurationPreset(60, "full-hour", "60 min", "A full hour"),
    NapDurationPreset(90, "sleep-cycle", "90 min", "Full sleep cycle"),
)

fun presetFor(minutes: Int): NapDurationPreset? =
    napDurationPresets.firstOrNull { it.minutes == minutes }

fun isValidDuration(minutes: Int): Boolean =
    minutes in MIN_NAP_MINUTES..MAX_NAP_MINUTES
