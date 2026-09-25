package app.siesta.wear.services

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import app.siesta.wear.MainActivity

/**
 * Foreground service that keeps the process at foreground priority while a
 * nap is armed — without it, Wear OS is free to kill the app when the user
 * presses the crown, and the Health Services exercise callback dies with it.
 * The exercise itself is tracked by the system-level Health Services process;
 * this service exists so OUR process stays alive to receive the samples.
 *
 * Probe: onDestroy/onTaskRemoved distinguish "user swiped the app away" from
 * "system killed us", which is central to the killed-app experiment.
 */
class NapMonitorService : Service() {

    override fun onCreate() {
        super.onCreate()
        ProbeLog.init(this)
        ProbeLog.log("fgs_create")

        val manager = getSystemService(NotificationManager::class.java)
        manager?.createNotificationChannel(
            NotificationChannel(
                MONITOR_CHANNEL,
                "Nap monitoring",
                NotificationManager.IMPORTANCE_LOW,
            )
        )
        val tap = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val notification = NotificationCompat.Builder(this, MONITOR_CHANNEL)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("Siesta")
            .setContentText("Watching for sleep…")
            .setOngoing(true)
            .setContentIntent(tap)
            .build()
        ServiceCompat.startForeground(
            this, NOTIFICATION_ID, notification,
            ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH,
        )
        ProbeLog.log("fgs_started", ProbeEnv.capture(this))
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        ProbeLog.log("fgs_start_cmd", mapOf("flags" to flags))
        return START_STICKY
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        // User swiped the app away — with stopWithTask=false we keep running,
        // and this event marks the kill-experiment boundary in the log.
        ProbeLog.log("fgs_task_removed")
        super.onTaskRemoved(rootIntent)
    }

    override fun onDestroy() {
        ProbeLog.log("fgs_destroy")
        ProbeLog.flush()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        private const val MONITOR_CHANNEL = "siesta-monitor"
        private const val NOTIFICATION_ID = 1001

        fun start(context: Context) {
            ContextCompat.startForegroundService(
                context, Intent(context, NapMonitorService::class.java)
            )
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, NapMonitorService::class.java))
        }
    }
}
