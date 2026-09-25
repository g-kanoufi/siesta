package siesta

import kotlinx.serialization.Serializable

/** One physiological sample: heartRate bpm and/or motion RMS (g). */
@Serializable
data class PhysioSample(
    val atMs: EpochMs,
    val heartRate: Double? = null,
    val motion: Double? = null,
)

@Serializable
data class SleepOnsetConfig(
    val baselineWindowMs: Long = 120_000,
    val confirmationWindowMs: Long = 180_000,
    val heartRateDropFraction: Double = 0.08,
    val motionThreshold: Double = 0.05,
)

val defaultOnsetConfig = SleepOnsetConfig()

/**
 * Sleep-onset heuristic — an estimate, never a claim. Mirrors
 * packages/core/src/sleepOnset.ts exactly; onset.json vectors pin behavior.
 */
class SleepOnsetDetector(private val config: SleepOnsetConfig = defaultOnsetConfig) {
    private var sessionStartMs: EpochMs? = null
    private var baselineSum = 0.0
    private var baselineCount = 0
    private var baselineHr: Double? = null
    private var qualifyingStartMs: EpochMs? = null

    var onsetAtMs: EpochMs? = null
        private set

    fun feed(sample: PhysioSample) {
        if (onsetAtMs != null) return
        if (sessionStartMs == null) sessionStartMs = sample.atMs

        val inBaseline = sample.atMs - sessionStartMs!! < config.baselineWindowMs
        if (inBaseline) {
            sample.heartRate?.let {
                baselineSum += it
                baselineCount += 1
            }
            return
        }

        if (baselineHr == null && baselineCount > 0) {
            baselineHr = baselineSum / baselineCount
        }

        val hrOk = sample.heartRate?.let { hr ->
            baselineHr != null && hr <= baselineHr!! * (1 - config.heartRateDropFraction)
        } ?: (baselineHr == null) // motion-only mode
        val motionOk = sample.motion?.let { it <= config.motionThreshold } ?: true

        if (hrOk && motionOk) {
            if (qualifyingStartMs == null) qualifyingStartMs = sample.atMs
            if (sample.atMs - qualifyingStartMs!! >= config.confirmationWindowMs) {
                onsetAtMs = qualifyingStartMs
            }
        } else {
            qualifyingStartMs = null
        }
    }

    fun reset() {
        sessionStartMs = null
        baselineSum = 0.0
        baselineCount = 0
        baselineHr = null
        qualifyingStartMs = null
        onsetAtMs = null
    }
}
