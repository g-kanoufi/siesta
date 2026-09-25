package siesta

import kotlinx.serialization.DeserializationStrategy
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonContentPolymorphicSerializer
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

enum class WakeIntensity { GENTLE, NORMAL, STRONG }

/** Vectors encode steps as {"kind":"pulse"|"pause", ...} — match that. */
object WakeStepSerializer : JsonContentPolymorphicSerializer<WakeStep>(WakeStep::class) {
    override fun selectDeserializer(element: JsonElement): DeserializationStrategy<WakeStep> =
        when (element.jsonObject["kind"]!!.jsonPrimitive.content) {
            "pulse" -> WakeStep.Pulse.serializer()
            "pause" -> WakeStep.Pause.serializer()
            else -> throw IllegalArgumentException("unknown wake step: $element")
        }
}

@Serializable(with = WakeStepSerializer::class)
sealed interface WakeStep {
    @Serializable
    data class Pulse(val intensity: Double, val durationMs: Long) : WakeStep

    @Serializable
    data class Pause(val durationMs: Long) : WakeStep
}

/**
 * Data, not code: Wear OS maps pulses to VibrationEffect amplitudes.
 * constants.json pins these values against @siesta/core.
 */
@Serializable
data class WakePattern(
    val steps: List<WakeStep>,
    val repeatIntervalMs: Long,
)

val wakePatterns: Map<WakeIntensity, WakePattern> = mapOf(
    WakeIntensity.GENTLE to WakePattern(
        steps = listOf(
            WakeStep.Pulse(0.35, 120),
            WakeStep.Pause(900),
            WakeStep.Pulse(0.45, 140),
            WakeStep.Pause(700),
            WakeStep.Pulse(0.55, 160),
            WakeStep.Pause(1400),
        ),
        repeatIntervalMs = 4000,
    ),
    WakeIntensity.NORMAL to WakePattern(
        steps = listOf(
            WakeStep.Pulse(0.5, 140),
            WakeStep.Pause(600),
            WakeStep.Pulse(0.65, 160),
            WakeStep.Pause(450),
            WakeStep.Pulse(0.8, 200),
            WakeStep.Pause(900),
        ),
        repeatIntervalMs = 3000,
    ),
    WakeIntensity.STRONG to WakePattern(
        steps = listOf(
            WakeStep.Pulse(0.65, 160),
            WakeStep.Pause(350),
            WakeStep.Pulse(0.85, 200),
            WakeStep.Pause(250),
            WakeStep.Pulse(1.0, 280),
            WakeStep.Pulse(1.0, 200),
            WakeStep.Pause(500),
        ),
        repeatIntervalMs = 2400,
    ),
)

fun patternDurationMs(pattern: WakePattern): Long = pattern.steps.sumOf {
    when (it) {
        is WakeStep.Pulse -> it.durationMs
        is WakeStep.Pause -> it.durationMs
    }
}
