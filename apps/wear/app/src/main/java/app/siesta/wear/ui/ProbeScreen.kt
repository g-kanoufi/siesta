package app.siesta.wear.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.Button
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.Text
import app.siesta.wear.services.ProbeLog

/** On-watch probe console: file stats plus a raw tail of the event log for
 * eyeballing without adb. Debug builds only — entry is gated in SiestaApp. */
@Composable
fun ProbeScreen(onBack: () -> Unit) {
    val lines by remember { mutableStateOf(ProbeLog.tail(80)) }
    val fileKb = remember { ProbeLog.fileSizeBytes / 1024 }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 10.dp, vertical = 20.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(
            text = "Probe · ${fileKb} KB",
            fontSize = 12.sp,
            color = MaterialTheme.colors.primary,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(bottom = 4.dp),
        )
        lines.forEach { line ->
            Text(
                text = line,
                fontSize = 7.sp,
                color = MaterialTheme.colors.onSurfaceVariant,
            )
        }
        Button(onClick = onBack) { Text("Back") }
    }
}
