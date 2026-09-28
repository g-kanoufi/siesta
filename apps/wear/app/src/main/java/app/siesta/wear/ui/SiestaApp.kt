package app.siesta.wear.ui

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.wear.compose.material.Button
import androidx.wear.compose.material.ButtonDefaults
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.Picker
import androidx.wear.compose.material.Text
import androidx.wear.compose.material.rememberPickerState
import androidx.wear.compose.material.Colors
import app.siesta.wear.BuildConfig
import app.siesta.wear.SessionViewModel
import siesta.NapState
import siesta.napDurationPresets

// Dusk palette — ports of packages/design-tokens/src/colors.ts (dark) +
// the shared sunset gradient stops.
private val SiestaColors = Colors(
    primary = Color(0xFFF5A36E),
    primaryVariant = Color(0xFFF5A36E),
    secondary = Color(0xFFD3BFB2),
    background = Color(0xFF1C1522),
    surface = Color(0xFF261C30),
    onPrimary = Color(0xFF301A20),
    onSecondary = Color(0xFF1C1522),
    onBackground = Color(0xFFFBF2E4),
    onSurface = Color(0xFFFBF2E4),
    onSurfaceVariant = Color(0xFFD3BFB2),
    error = Color(0xFFEE8B73),
    onError = Color(0xFF1C1522),
)

val DuskSky = Brush.verticalGradient(
    0f to Color(0xFF2E1F3E),      // sunset.zenith
    0.45f to Color(0xFF1C1522),   // background
    1f to Color(0xFF130E1A),      // scrim
)

@Composable
fun SiestaApp(viewModel: SessionViewModel) {
    val view by viewModel.view.collectAsStateWithLifecycle()
    val selected by viewModel.selectedMinutes.collectAsStateWithLifecycle()
    val ready by viewModel.ready.collectAsStateWithLifecycle()
    val showProbe by viewModel.showProbe.collectAsStateWithLifecycle()
    val didOnboard by viewModel.didOnboard.collectAsStateWithLifecycle()
    val showSleepAccess by viewModel.showSleepAccessPrompt.collectAsStateWithLifecycle()

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { viewModel.confirmSleepAccess() }

    MaterialTheme(colors = SiestaColors) {
        if (!ready) return@MaterialTheme
        if (BuildConfig.DEBUG && showProbe) {
            ProbeScreen { viewModel.setShowProbe(false) }
            return@MaterialTheme
        }
        if (!didOnboard) {
            OnboardingScreen { viewModel.completeOnboarding() }
            return@MaterialTheme
        }
        if (showSleepAccess) {
            SleepAccessScreen {
                permissionLauncher.launch(
                    arrayOf(
                        Manifest.permission.BODY_SENSORS,
                        Manifest.permission.POST_NOTIFICATIONS,
                    ),
                )
            }
            return@MaterialTheme
        }
        // Dusk gradient behind everything.
        Box(Modifier.fillMaxSize().background(DuskSky)) {
        when (view?.state ?: NapState.IDLE) {
            NapState.IDLE, NapState.SELECTING_DURATION ->
                SelectionScreen(viewModel, selected)
            NapState.ARMED, NapState.WAITING_FOR_SLEEP ->
                StatusScreen(
                    view?.state ?: NapState.ARMED,
                    "Waiting for sleep…",
                    failSafeDetail(view?.nextDeadlineMs),
                    "Cancel",
                    debugAction = { viewModel.simulateSleep() },
                ) {
                    viewModel.cancel()
                }
            NapState.SLEEPING ->
                StatusScreen(
                    NapState.SLEEPING,
                    "Sleeping",
                    remainingDetail(view?.remainingMs),
                    "Cancel",
                    detailSemantics = remainingAccessibility(view?.remainingMs),
                ) {
                    viewModel.cancel()
                }
            NapState.WAKING ->
                StatusScreen(NapState.WAKING, "Welcome back.", "", "I'm awake") {
                    viewModel.acknowledgeWake()
                }
            NapState.COMPLETED ->
                StatusScreen(NapState.COMPLETED, "Welcome back.", "", "Done") {
                    viewModel.acknowledgeWake()
                }
            NapState.CANCELLED ->
                StatusScreen(NapState.CANCELLED, "Cancelled", "", "Done") { viewModel.cancel() }
            NapState.ERROR ->
                ErrorScreen { viewModel.beginManually() }
        }
        }
    }
}

@Composable
private fun SelectionScreen(viewModel: SessionViewModel, selected: Int) {
    val intensity by viewModel.wakeIntensity.collectAsStateWithLifecycle()
    val presetIndex = napDurationPresets
        .indexOfFirst { it.minutes == selected }
        .coerceAtLeast(0)
    val pickerState = rememberPickerState(
        initialNumberOfOptions = napDurationPresets.size,
        initiallySelectedOption = presetIndex,
    )
    val pickedMinutes = napDurationPresets[pickerState.selectedOption].minutes
    if (pickedMinutes != selected) viewModel.selectDuration(pickedMinutes)

    Column(
        modifier = Modifier.fillMaxSize().padding(horizontal = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Hammock(
            state = NapState.IDLE,
            accent = MaterialTheme.colors.onSurface,
            modifier = Modifier.size(width = 64.dp, height = 28.dp),
        )
        Text(
            text = "$pickedMinutes",
            fontSize = 34.sp,
            color = MaterialTheme.colors.onBackground,
        )
        Text(
            text = "min",
            fontSize = 12.sp,
            color = MaterialTheme.colors.onSurfaceVariant,
        )
        Picker(
            state = pickerState,
            modifier = Modifier.size(120.dp, 44.dp),
            contentDescription = "Nap duration in minutes",
        ) { option ->
            Text(
                text = "${napDurationPresets[option].minutes}",
                fontSize = 16.sp,
                textAlign = TextAlign.Center,
            )
        }
        Button(onClick = { viewModel.begin() }) {
            Text("Start siesta")
        }
        Text(
            text = "Wake: ${intensity.name.lowercase().replaceFirstChar { it.titlecase() }}",
            fontSize = 10.sp,
            color = MaterialTheme.colors.onSurfaceVariant,
            modifier = Modifier
                .padding(top = 2.dp)
                .clickable { viewModel.cycleWakeIntensity() },
        )
        if (BuildConfig.DEBUG) {
            Text(
                text = "probe",
                fontSize = 9.sp,
                color = MaterialTheme.colors.onSurfaceVariant,
                modifier = Modifier
                    .padding(top = 2.dp)
                    .clickable { viewModel.setShowProbe(true) },
            )
        }
    }
}

@Composable
private fun StatusScreen(
    state: NapState,
    title: String,
    detail: String,
    actionLabel: String,
    debugAction: (() -> Unit)? = null,
    detailSemantics: String? = null,
    onAction: () -> Unit,
) {
    // The wake moment arrives soft — content fades in over ~350 ms.
    val alpha = remember { Animatable(if (state == NapState.WAKING) 0f else 1f) }
    LaunchedEffect(state) {
        if (alpha.value == 0f) alpha.animateTo(1f, tween(350))
    }
    Column(
        modifier = Modifier.fillMaxSize().padding(12.dp).alpha(alpha.value),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Hammock(
            state = state,
            accent = MaterialTheme.colors.onSurface,
            modifier = Modifier.size(width = 64.dp, height = 28.dp),
        )
        Text(
            text = title,
            fontSize = 15.sp,
            color = MaterialTheme.colors.onBackground,
            textAlign = TextAlign.Center,
        )
        if (detail.isNotEmpty()) {
            Text(
                text = detail,
                fontSize = 11.sp,
                color = MaterialTheme.colors.onSurfaceVariant,
                textAlign = TextAlign.Center,
                modifier = Modifier.semantics {
                    contentDescription = detailSemantics ?: detail
                },
            )
        }
        if (actionLabel == "Cancel") {
            Button(
                onClick = onAction,
                colors = ButtonDefaults.secondaryButtonColors(),
            ) { Text(actionLabel) }
        } else {
            Button(onClick = onAction) { Text(actionLabel) }
        }
        if (BuildConfig.DEBUG && debugAction != null) {
            Text(
                text = "Simulate sleep",
                fontSize = 9.sp,
                color = MaterialTheme.colors.onSurfaceVariant,
                modifier = Modifier
                    .padding(top = 2.dp)
                    .clickable { debugAction() },
            )
        }
    }
}

/// First-run intro per the brief: three short screens, no carousel chrome.
@Composable
private fun OnboardingScreen(onDone: () -> Unit) {
    val pages = listOf(
        "Meet Siesta." to "A tiny nap timer that waits for you to fall asleep.",
        "Pick your nap." to "Choose how long you'd like to sleep.",
        "We'll wake you gently." to "Siesta uses your watch's haptics when your nap is over.",
    )
    var page by remember { mutableIntStateOf(0) }
    val (title, body) = pages[page]
    Column(
        modifier = Modifier.fillMaxSize().padding(12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Hammock(
            state = NapState.IDLE,
            accent = MaterialTheme.colors.onSurface,
            modifier = Modifier.size(width = 64.dp, height = 28.dp),
        )
        Text(text = title, fontSize = 15.sp, color = MaterialTheme.colors.onBackground)
        Text(
            text = body,
            fontSize = 11.sp,
            color = MaterialTheme.colors.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        Button(onClick = { if (page == pages.lastIndex) onDone() else page++ }) {
            Text(if (page == pages.lastIndex) "Continue" else "Next")
        }
    }
}

/// One-time contextual explainer before the first runtime permission request
/// (brief §47: ask at the moment of use, never without context).
@Composable
private fun SleepAccessScreen(onAllow: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Hammock(
            state = NapState.IDLE,
            accent = MaterialTheme.colors.onSurface,
            modifier = Modifier.size(width = 64.dp, height = 28.dp),
        )
        Text(
            text = "To know when you've fallen asleep, Siesta reads your heart rate.",
            fontSize = 12.sp,
            color = MaterialTheme.colors.onBackground,
            textAlign = TextAlign.Center,
        )
        Button(onClick = onAllow) { Text("Allow sleep access") }
    }
}

@Composable
private fun ErrorScreen(onManualStart: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            text = "Couldn't access sleep data.",
            fontSize = 13.sp,
            textAlign = TextAlign.Center,
        )
        Button(onClick = onManualStart) { Text("Start without detection") }
    }
}

private fun remainingDetail(ms: Long?): String =
    if (ms == null) "" else {
        val total = (ms + 999) / 1000
        "%d:%02d remaining".format(total / 60, total % 60)
    }

/// TalkBack reads "17:42" as "seventeen colon forty-two" — announce words (§28).
private fun remainingAccessibility(ms: Long?): String =
    if (ms == null) "" else {
        val total = (ms + 999) / 1000
        val m = total / 60
        val s = total % 60
        if (s == 0L) "$m minutes remaining" else "$m minutes, $s seconds remaining"
    }

private fun failSafeDetail(ms: Long?): String =
    if (ms == null) "" else {
        val t = java.util.concurrent.TimeUnit.MILLISECONDS
        val d = java.util.Date(ms)
        val fmt = java.text.SimpleDateFormat("h:mm a", java.util.Locale.getDefault())
        "We'll wake you by ${fmt.format(d)} at the latest."
    }
