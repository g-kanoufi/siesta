package siesta

import kotlinx.coroutines.test.runTest
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import siesta.testing.InMemorySessionStore
import siesta.testing.ManualClock
import siesta.testing.MockSleepDetectionService
import siesta.testing.RecordingAlarmScheduler
import siesta.testing.RecordingHaptics
import siesta.testing.ScheduledAlarm
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertNotNull

private val json = Json { ignoreUnknownKeys = true }

/** Vectors live in packages/test-vectors/vectors (module dir → ../test-vectors). */
private val vectorsDir: File =
    File(System.getProperty("user.dir")).parentFile.resolve("test-vectors/vectors")

private fun loadJson(name: String): JsonObject =
    json.parseToJsonElement(vectorsDir.resolve("$name.json").readText()).jsonObject

private fun napStateOf(wire: String): NapState = NapState.fromWire(wire)

private fun napEventOf(o: JsonObject): NapEvent =
    when (val type = o["type"]!!.jsonPrimitive.content) {
        "duration_selected" -> NapEvent.DurationSelected(o["minutes"]!!.jsonPrimitive.content.toInt())
        "start" -> NapEvent.Start
        "detector_ready" -> NapEvent.DetectorReady
        "sleep_detected" -> NapEvent.SleepDetected(o["atMs"]!!.jsonPrimitive.content.toLong())
        "wake_due" -> NapEvent.WakeDue
        "wake_acknowledged" -> NapEvent.WakeAcknowledged
        "cancel" -> NapEvent.Cancel
        "error" -> NapEvent.Error(o["reason"]!!.jsonPrimitive.content)
        "reset" -> NapEvent.Reset
        else -> error("unknown event: $type")
    }

class TransitionVectorTests {
    @Test
    fun allTransitions() {
        val file = loadJson("transitions")
        assertEquals(1, file["version"]!!.jsonPrimitive.content.toInt())
        val cases = file["cases"]!!.let { json.decodeFromJsonElement<List<TransitionCase>>(it) }
        assertEquals(81, cases.size)
        for (c in cases) {
            assertEquals(
                napStateOf(c.to),
                transition(napStateOf(c.from), napEventOf(c.event)),
                "${c.from} + ${c.event["type"]} should be ${c.to}",
            )
        }
    }

    @Serializable
    private data class TransitionCase(val from: String, val event: JsonObject, val to: String)
}

class WakeVectorTests {
    @Serializable
    private data class WakeCase(
        val sleepDetectedAtMs: Long,
        val durationMinutes: Int,
        val expectedWakeAtMs: Long,
    )

    @Serializable
    private data class FailSafeCase(
        val armedAtMs: Long,
        val durationMinutes: Int,
        val graceMinutes: Int,
        val failSafeWakeAtMs: Long,
    )

    @Test
    fun wakeTimes() {
        val cases = json.decodeFromJsonElement<List<WakeCase>>(loadJson("wake")["cases"]!!)
        for (c in cases) {
            assertEquals(c.expectedWakeAtMs, computeWakeAtMs(c.sleepDetectedAtMs, c.durationMinutes))
        }
    }

    @Test
    fun failSafe() {
        val cases = json.decodeFromJsonElement<List<FailSafeCase>>(loadJson("failSafe")["cases"]!!)
        for (c in cases) {
            assertEquals(
                c.failSafeWakeAtMs,
                computeFailSafeWakeAtMs(c.armedAtMs, c.durationMinutes, c.graceMinutes),
            )
        }
    }
}

class OnsetVectorTests {
    @Serializable
    private data class OnsetCase(
        val name: String,
        val config: SleepOnsetConfig,
        val samples: List<PhysioSample>,
        val expectedOnsetAtMs: Long? = null,
    )

    @Test
    fun onsetDetection() {
        val cases = json.decodeFromJsonElement<List<OnsetCase>>(loadJson("onset")["cases"]!!)
        for (c in cases) {
            val detector = SleepOnsetDetector(c.config)
            for (s in c.samples) detector.feed(s)
            assertEquals(c.expectedOnsetAtMs, detector.onsetAtMs, c.name)
        }
    }
}

class ScenarioVectorTests {
    @Serializable
    private data class AlarmDTO(val atMs: Long, val kind: AlarmKind, val sessionId: String)

    @Serializable
    private data class SessionDTO(
        val state: NapState,
        val selectedDurationMinutes: Int,
        val armedAtMs: Long? = null,
        val sleepDetectedAtMs: Long? = null,
        val expectedWakeAtMs: Long? = null,
        val failSafeWakeAtMs: Long? = null,
    )

    @Serializable
    private data class Expected(
        val state: NapState,
        val session: SessionDTO? = null,
        val remainingMs: Long? = null,
        val scheduledAlarms: List<AlarmDTO>,
        val wakePatternsPlayed: List<WakePattern>,
    )

    @Serializable
    private data class ScenarioCase(
        val name: String,
        val startMs: Long,
        val ops: List<JsonObject>,
        val expected: Expected,
    )

    @Serializable
    private data class ScenarioFile(val version: Int, val cases: List<ScenarioCase>)

    @Test
    fun scenarios() = runTest {
        val file = json.decodeFromJsonElement<ScenarioFile>(loadJson("scenarios"))
        for (c in file.cases) replay(c)
    }

    private suspend fun replay(c: ScenarioCase) {
        val clock = ManualClock(c.startMs)
        val sleep = MockSleepDetectionService()
        val scheduler = RecordingAlarmScheduler()
        val haptics = RecordingHaptics()
        val store = InMemorySessionStore()
        var ids = 0
        val newId = { "nap-${++ids}" }
        var m = NapSessionManager(clock, sleep, scheduler, haptics, store, newId)

        for (op in c.ops) {
            when (op["op"]!!.jsonPrimitive.content) {
                "select" -> m.selectDuration(op["minutes"]!!.jsonPrimitive.content.toInt())
                "start" -> m.start()
                "startManually" -> m.startManually()
                "advance" -> clock.set(op["toMs"]!!.jsonPrimitive.content.toLong())
                "sleepDetected" -> sleep.simulateSleep(op["atMs"]!!.jsonPrimitive.content.toLong())
                "tick" -> m.tick()
                "acknowledge" -> m.acknowledgeWake()
                "cancel" -> m.cancel()
                "dismiss" -> m.dismiss()
                "resume" -> {
                    clock.set(op["atMs"]!!.jsonPrimitive.content.toLong())
                    m = NapSessionManager.resume(clock, sleep, scheduler, haptics, store, newId)
                }
                else -> error("${c.name}: unknown op ${op["op"]}")
            }
        }

        val e = c.expected
        assertEquals(e.state, m.state, c.name)

        if (e.session != null) {
            val s = assertNotNull(m.snapshot, "${c.name}: expected a session")
            assertEquals(e.session.state, s.state, c.name)
            assertEquals(e.session.selectedDurationMinutes, s.selectedDurationMinutes, c.name)
            assertEquals(e.session.armedAtMs, s.armedAtMs, c.name)
            assertEquals(e.session.sleepDetectedAtMs, s.sleepDetectedAtMs, c.name)
            assertEquals(e.session.expectedWakeAtMs, s.expectedWakeAtMs, c.name)
            assertEquals(e.session.failSafeWakeAtMs, s.failSafeWakeAtMs, c.name)
        } else {
            assertNull(m.snapshot, "${c.name}: expected no session")
        }

        assertEquals(e.remainingMs, m.remainingMs(), c.name)
        assertEquals(
            e.scheduledAlarms,
            scheduler.scheduled.map { AlarmDTO(it.atMs, it.kind, it.sessionId) },
            c.name,
        )
        assertEquals(e.wakePatternsPlayed, haptics.played.toList(), c.name)
    }
}

class ConstantsVectorTests {
    @Serializable
    private data class ConstantsFile(
        val version: Int,
        val values: Values,
    ) {
        @Serializable
        data class Values(
            val napStates: List<String>,
            val durationPresets: List<NapDurationPreset>,
            val failSafeGraceMinutes: Int,
            val onsetConfig: SleepOnsetConfig,
            val wakePatterns: Map<String, WakePattern>,
        )
    }

    @Test
    fun constantsMatchCore() {
        val file = json.decodeFromJsonElement<ConstantsFile>(loadJson("constants"))
        val v = file.values

        assertEquals(NapState.entries.map { it.serialName }, v.napStates)
        assertEquals(v.durationPresets, napDurationPresets)
        assertEquals(v.failSafeGraceMinutes, DEFAULT_FAIL_SAFE_GRACE_MINUTES)
        assertEquals(v.onsetConfig, defaultOnsetConfig)
        for ((name, pattern) in v.wakePatterns) {
            assertEquals(wakePatterns[WakeIntensity.valueOf(name.uppercase())], pattern, name)
        }
    }
}

private val NapState.serialName: String
    get() = when (this) {
        NapState.IDLE -> "idle"
        NapState.SELECTING_DURATION -> "selecting_duration"
        NapState.ARMED -> "armed"
        NapState.WAITING_FOR_SLEEP -> "waiting_for_sleep"
        NapState.SLEEPING -> "sleeping"
        NapState.WAKING -> "waking"
        NapState.COMPLETED -> "completed"
        NapState.CANCELLED -> "cancelled"
        NapState.ERROR -> "error"
    }


