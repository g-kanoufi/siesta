package app.siesta.wear.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
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

private val SiestaColors = Colors(
    primary = Color(0xFFE8A15C),
    primaryVariant = Color(0xFFE8A15C),
    secondary = Color(0xFFB3A894),
    background = Color(0xFF161310),
    surface = Color(0xFF201B16),
    onPrimary = Color(0xFF2A1C0D),
    onSecondary = Color(0xFF161310),
    onBackground = Color(0xFFF3EDE3),
    onSurface = Color(0xFFF3EDE3),
    onSurfaceVariant = Color(0xFFB3A894),
    error = Color(0xFFDE8A76),
    onError = Color(0xFF161310),
)

@Composable
fun SiestaApp(viewModel: SessionViewModel) {
    val view by viewModel.view.collectAsStateWithLifecycle()
    val selected by viewModel.selectedMinutes.collectAsStateWithLifecycle()
    val ready by viewModel.ready.collectAsStateWithLifecycle()
    val showProbe by viewModel.showProbe.collectAsStateWithLifecycle()

    MaterialTheme(colors = SiestaColors) {
        if (!ready) return@MaterialTheme
        if (BuildConfig.DEBUG && showProbe) {
            ProbeScreen { viewModel.setShowProbe(false) }
            return@MaterialTheme
        }
        when (view?.state ?: NapState.IDLE) {
            NapState.IDLE, NapState.SELECTING_DURATION ->
                SelectionScreen(viewModel, selected)
            NapState.ARMED, NapState.WAITING_FOR_SLEEP ->
                StatusScreen("Waiting for sleep…", failSafeDetail(view?.nextDeadlineMs), "Cancel") {
                    viewModel.cancel()
                }
            NapState.SLEEPING ->
                StatusScreen("Sleeping", remainingDetail(view?.remainingMs), "Cancel") {
                    viewModel.cancel()
                }
            NapState.WAKING ->
                StatusScreen("Welcome back.", "", "I'm awake") {
                    viewModel.acknowledgeWake()
                }
            NapState.COMPLETED ->
                StatusScreen("Welcome back.", "", "Done") {
                    viewModel.acknowledgeWake()
                }
            NapState.CANCELLED ->
                StatusScreen("Cancelled", "", "Done") { viewModel.cancel() }
            NapState.ERROR ->
                ErrorScreen { viewModel.beginManually() }
        }
    }
}

@Composable
private fun SelectionScreen(viewModel: SessionViewModel, selected: Int) {
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
            accent = MaterialTheme.colors.primary,
            post = MaterialTheme.colors.onSurface.copy(alpha = 0.5f),
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
    title: String,
    detail: String,
    actionLabel: String,
    onAction: () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxSize().padding(12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Hammock(
            state = NapState.SLEEPING,
            accent = MaterialTheme.colors.primary,
            post = MaterialTheme.colors.onSurface.copy(alpha = 0.5f),
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

private fun failSafeDetail(ms: Long?): String =
    if (ms == null) "" else {
        val t = java.util.concurrent.TimeUnit.MILLISECONDS
        val d = java.util.Date(ms)
        val fmt = java.text.SimpleDateFormat("h:mm a", java.util.Locale.getDefault())
        "We'll wake you by ${fmt.format(d)} at the latest."
    }
