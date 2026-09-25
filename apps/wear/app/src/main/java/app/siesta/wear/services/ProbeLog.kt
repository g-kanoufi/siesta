package app.siesta.wear.services

import android.content.Context
import android.app.KeyguardManager
import android.os.BatteryManager
import android.os.PowerManager
import java.io.File
import java.util.concurrent.locks.ReentrantLock
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlin.concurrent.withLock

/**
 * Hardware-validation probe. Identical schema to watchOS `Probe.swift` —
 * one JSON object per line, consumed by `scripts/probe-report.mjs`:
 *
 *     {"t":1758820000000,"app":"wearos","v":1,"ev":"hr_sample",
 *      "session":"nap-…","d":{…}}
 *
 * Pull with: adb shell run-as app.siesta.wear cat files/probe.jsonl
 * Lines buffer in memory and flush in batches so logging itself does not
 * distort the battery measurements it exists to capture.
 */
object ProbeLog {
    private const val FILE_NAME = "probe.jsonl"
    private const val MAX_BYTES = 4L * 1024 * 1024
    private const val BUFFER_CAP = 512

    private val lock = ReentrantLock()
    private val buffer = ArrayDeque<String>()

    @Volatile private var file: File? = null

    /** Set when a nap arms so every event can be grouped per nap session. */
    @Volatile var sessionId: String? = null

    fun init(context: Context) {
        val f = File(context.applicationContext.filesDir, FILE_NAME)
        if (f.exists() && f.length() > MAX_BYTES) f.delete()
        file = f
        flush()
    }

    fun log(event: String, fields: Map<String, Any?> = emptyMap()) {
        val obj = buildMap<String, JsonElement> {
            put("t", JsonPrimitive(System.currentTimeMillis()))
            put("app", JsonPrimitive("wearos"))
            put("v", JsonPrimitive(1))
            put("ev", JsonPrimitive(event))
            sessionId?.let { put("session", JsonPrimitive(it)) }
            if (fields.isNotEmpty()) {
                put("d", JsonObject(fields.mapValues { (_, v) -> v.toJson() }))
            }
        }
        val line = JsonObject(obj).toString()
        val count = lock.withLock {
            buffer.addLast(line)
            while (buffer.size > BUFFER_CAP) buffer.removeFirst()
            buffer.size
        }
        if (count >= 32) flush()
    }

    fun flush() {
        val lines = lock.withLock {
            val out = buffer.toList()
            buffer.clear()
            out
        }
        val f = file ?: return
        if (lines.isEmpty()) return
        runCatching {
            if (!f.exists()) f.createNewFile()
            f.appendText(lines.joinToString("\n") + "\n")
        }
    }

    fun tail(n: Int = 80): List<String> {
        flush()
        val f = file ?: return emptyList()
        return runCatching { f.readLines().takeLast(n) }.getOrDefault(emptyList())
    }

    val fileSizeBytes: Long
        get() {
            flush()
            return file?.length() ?: 0
        }
}

/** Environment snapshot attached to milestone events — the variables that
 * explain missing HR samples or a dead alarm: battery, power-save mode,
 * screen, and keyguard state. */
object ProbeEnv {
    fun capture(context: Context): Map<String, Any?> {
        val bm = context.getSystemService(BatteryManager::class.java)
        val pm = context.getSystemService(PowerManager::class.java)
        val km = context.getSystemService(KeyguardManager::class.java)
        val pct = bm?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
        return mapOf(
            "batteryPct" to pct?.takeIf { it >= 0 },
            "powerSave" to pm?.isPowerSaveMode,
            "interactive" to pm?.isInteractive,
            "keyguard" to km?.isKeyguardLocked,
        )
    }
}

private fun Any?.toJson(): JsonElement = when (this) {
    null -> JsonNull
    is Boolean -> JsonPrimitive(this)
    is Int -> JsonPrimitive(this)
    is Long -> JsonPrimitive(this)
    is Double -> JsonPrimitive(this)
    is Float -> JsonPrimitive(this.toDouble())
    is String -> JsonPrimitive(this)
    is Map<*, *> -> JsonObject(
        entries.associate { (k, v) -> k.toString() to v.toJson() }
    )
    is List<*> -> JsonArray(map { it.toJson() })
    else -> JsonPrimitive(toString())
}
