package app.siesta.wear

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import app.siesta.wear.services.ProbeLog
import app.siesta.wear.ui.SiestaApp

class MainActivity : ComponentActivity() {

    private lateinit var viewModel: SessionViewModel

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { /* The detector's own start() re-checks; denial lands in ERROR state. */ }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        ProbeLog.init(applicationContext)
        ProbeLog.log("lifecycle", mapOf("event" to "activity_create"))
        viewModel = SessionViewModel(application)

        val needed = arrayOf(
            Manifest.permission.BODY_SENSORS,
            Manifest.permission.POST_NOTIFICATIONS,
        ).filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
        if (needed.isNotEmpty()) permissionLauncher.launch(needed.toTypedArray())

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
