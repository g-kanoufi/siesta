package app.siesta.wear.ui

import android.provider.Settings
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.dp
import siesta.NapState

// Motion parity with packages/design-tokens/src/motion.ts — keep in sync.
private const val SWAY_PERIOD_MS = 6_200
private const val SWAY_DEGREES = 1.6f
private const val BREATHE_PERIOD_MS = 4_200
private const val BREATHE_SCALE = 1.018f
private const val RISE_PX = 14f
private const val RISE_STIFFNESS = 90f
private const val RISE_DAMPING = 0.632f // 12 / (2*sqrt(90*1))

/** The geometric hammock mark — one broad, clean lens of cloth. No trunk,
 *  ropes or sun. */
@Composable
fun Hammock(
    state: NapState,
    accent: Color,
    modifier: Modifier = Modifier,
) {
    // Android's closest public "reduce motion" signal: animator scale 0.
    val context = LocalContext.current
    val reducedMotion = remember {
        Settings.Global.getFloat(
            context.contentResolver,
            Settings.Global.ANIMATOR_DURATION_SCALE,
            1f,
        ) == 0f
    }

    val ambient = state == NapState.SLEEPING || state == NapState.WAITING_FOR_SLEEP ||
        state == NapState.ARMED
    val rotation: Float
    val breathe: Float
    if (ambient && !reducedMotion) {
        val transition = rememberInfiniteTransition(label = "ambient")
        rotation = if (state == NapState.SLEEPING) {
            transition.animateFloat(
                initialValue = -SWAY_DEGREES,
                targetValue = SWAY_DEGREES,
                animationSpec = infiniteRepeatable(
                    animation = tween(SWAY_PERIOD_MS / 2, easing = LinearEasing),
                    repeatMode = RepeatMode.Reverse,
                ),
                label = "sway",
            ).value
        } else 0f
        breathe = if (state == NapState.WAITING_FOR_SLEEP || state == NapState.ARMED) {
            transition.animateFloat(
                initialValue = 1f,
                targetValue = BREATHE_SCALE,
                animationSpec = infiniteRepeatable(
                    animation = tween(BREATHE_PERIOD_MS / 2, easing = LinearEasing),
                    repeatMode = RepeatMode.Reverse,
                ),
                label = "breathe",
            ).value
        } else 1f
    } else {
        rotation = 0f
        breathe = 1f
    }

    // Waking/completed: one-shot rise-and-settle spring.
    val lift = remember { Animatable(if (isWakingState(state)) RISE_PX else 0f) }
    LaunchedEffect(state, reducedMotion) {
        if (reducedMotion) {
            lift.snapTo(0f)
        } else if (isWakingState(state)) {
            lift.snapTo(RISE_PX)
            lift.animateTo(0f, spring(dampingRatio = RISE_DAMPING, stiffness = RISE_STIFFNESS))
        } else {
            lift.snapTo(0f)
        }
    }

    Canvas(modifier = modifier.clearAndSetSemantics {}) {
        val w = size.width
        val h = size.height
        translate(top = -lift.value) {
            scale(breathe, pivot = Offset(w / 2f, h / 2f)) {
                rotate(degrees = rotation, pivot = Offset(w / 2f, 0f)) {
                    val logoScale = minOf(w / 1024f, h / 462f)
                    val logoLeft = (w - 1024f * logoScale) / 2f
                    val logoTop = (h - 462f * logoScale) / 2f
                    fun point(x: Float, y: Float) =
                        Offset(logoLeft + x * logoScale, logoTop + (y - 382f) * logoScale)

                    val reflections = Path().apply {
                        for ((centerY, radiusX, radiusY) in listOf(
                            Triple(715f, 155f, 13f),
                            Triple(760f, 105f, 10f),
                            Triple(801f, 62f, 8f),
                            Triple(838f, 30f, 6f),
                        )) {
                            val center = point(512f, centerY)
                            val radius = Offset(radiusX * logoScale, radiusY * logoScale)
                            addOval(Rect(
                                center.x - radius.x,
                                center.y - radius.y,
                                center.x + radius.x,
                                center.y + radius.y,
                            ))
                        }
                    }
                    drawPath(reflections, color = Color(0xFFFFB35D).copy(alpha = 0.78f))

                    val hammock = Path().apply {
                        moveTo(point(0f, 382f).x, point(0f, 382f).y)
                        lineTo(point(82f, 449f).x, point(82f, 449f).y)
                        cubicTo(
                            point(210f, 548f).x, point(210f, 548f).y,
                            point(350f, 610f).x, point(350f, 610f).y,
                            point(512f, 610f).x, point(512f, 610f).y,
                        )
                        cubicTo(
                            point(674f, 610f).x, point(674f, 610f).y,
                            point(814f, 548f).x, point(814f, 548f).y,
                            point(942f, 449f).x, point(942f, 449f).y,
                        )
                        lineTo(point(1024f, 382f).x, point(1024f, 382f).y)
                        lineTo(point(1024f, 414f).x, point(1024f, 414f).y)
                        lineTo(point(948f, 476f).x, point(948f, 476f).y)
                        cubicTo(
                            point(821f, 582f).x, point(821f, 582f).y,
                            point(680f, 650f).x, point(680f, 650f).y,
                            point(512f, 650f).x, point(512f, 650f).y,
                        )
                        cubicTo(
                            point(344f, 650f).x, point(344f, 650f).y,
                            point(203f, 582f).x, point(203f, 582f).y,
                            point(76f, 476f).x, point(76f, 476f).y,
                        )
                        lineTo(point(0f, 414f).x, point(0f, 414f).y)
                        close()
                        for ((x, y) in listOf(82f to 449f, 942f to 449f)) {
                            val center = point(x, y)
                            val radius = 18f * logoScale
                            addOval(Rect(
                                center.x - radius,
                                center.y - radius,
                                center.x + radius,
                                center.y + radius,
                            ))
                        }
                    }
                    drawPath(hammock, color = accent)
                }
            }
        }
    }
}

private fun isWakingState(state: NapState) =
    state == NapState.WAKING || state == NapState.COMPLETED
