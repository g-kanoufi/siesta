package app.siesta.wear

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import app.siesta.wear.services.ProbeLog
import app.siesta.wear.ui.SiestaApp

class MainActivity : ComponentActivity() {

    private lateinit var viewModel: SessionViewModel

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        ProbeLog.init(applicationContext)
        ProbeLog.log("lifecycle", mapOf("event" to "activity_create"))
        viewModel = SessionViewModel(application)
        // Permissions are requested at first arm, after the in-app explainer —
        // not here at launch (brief §47).
        setContent { SiestaApp(viewModel) }
    }

    override fun onResume() {
        super.onResume()
        ProbeLog.log("lifecycle", mapOf("event" to "activity_resume"))
    }

    override fun onPause() {
        super.onPause()
        ProbeLog.log("lifecycle", mapOf("event" to "activity_pause"))
        ProbeLog.flush()
    }

    override fun onDestroy() {
        super.onDestroy()
        ProbeLog.log("lifecycle", mapOf("event" to "activity_destroy"))
        ProbeLog.flush()
    }
}
