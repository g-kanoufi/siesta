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
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
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

/** The geometric hammock mark — two posts, one dip. Same mark everywhere. */
@Composable
fun Hammock(
    state: NapState,
    accent: Color,
    post: Color,
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
                    val postW = w * 0.045f
                    val postH = h * 0.55f
                    drawRoundRect(
                        color = post,
                        topLeft = Offset(0f, h * 0.05f),
                        size = Size(postW, postH),
                        cornerRadius = CornerRadius(postW / 2),
                    )
                    drawRoundRect(
                        color = post,
                        topLeft = Offset(w - postW, h * 0.05f),
                        size = Size(postW, postH),
                        cornerRadius = CornerRadius(postW / 2),
                    )
                    val path = Path().apply {
                        moveTo(postW / 2, h * 0.12f)
                        quadraticBezierTo(w / 2f, h * 1.15f, w - postW / 2, h * 0.12f)
                    }
                    drawPath(path, color = accent, style = Stroke(width = w * 0.05f))
                }
            }
        }
    }
}

private fun isWakingState(state: NapState) =
    state == NapState.WAKING || state == NapState.COMPLETED
