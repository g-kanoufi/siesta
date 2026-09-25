package app.siesta.wear.ui

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.unit.dp
import siesta.NapState

private const val SWAY_PERIOD_MS = 6_200
private const val SWAY_DEGREES = 1.6f

/** The geometric hammock mark — two posts, one dip. Same mark everywhere. */
@Composable
fun Hammock(
    state: NapState,
    accent: Color,
    post: Color,
    modifier: Modifier = Modifier,
) {
    val rotation = if (state == NapState.SLEEPING) {
        val transition = rememberInfiniteTransition(label = "sway")
        val angle by transition.animateFloat(
            initialValue = -SWAY_DEGREES,
            targetValue = SWAY_DEGREES,
            animationSpec = infiniteRepeatable(
                animation = tween(SWAY_PERIOD_MS / 2, easing = LinearEasing),
                repeatMode = RepeatMode.Reverse,
            ),
            label = "sway",
        )
        angle
    } else 0f

    Canvas(modifier = modifier) {
        val w = size.width
        val h = size.height
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
