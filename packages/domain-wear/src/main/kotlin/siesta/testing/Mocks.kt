package siesta.testing

import siesta.AlarmKind
import siesta.AlarmScheduler
import siesta.Clock
import siesta.EpochMs
import siesta.HapticService
import siesta.NapSessionSnapshot
import siesta.SessionStore
import siesta.SleepDetectionService
import siesta.WakePattern

class ManualClock(startMs: EpochMs) : Clock {
    private var current = startMs
    override fun nowMs(): EpochMs = current
    fun set(ms: EpochMs) { current = ms }
    fun advance(deltaMs: Long) { current += deltaMs }
}

/** Dev/test detector. `simulateSleep` is the "Simulate sleep" dev control. */
class MockSleepDetectionService : SleepDetectionService {
    var startCalls = 0; private set
    var stopCalls = 0; private set
    var running = false; private set
    private var failStartError: Exception? = null
    private val listeners = mutableMapOf<Int, (EpochMs) -> Unit>()
    private var nextListenerId = 0

    override suspend fun start() {
        startCalls += 1
        failStartError?.let { throw it }
        running = true
    }

    override fun stop() {
        if (running) {
            stopCalls += 1
            running = false
        }
    }

    override fun onSleepDetected(callback: (EpochMs) -> Unit): () -> Unit {
        val id = nextListenerId++
        listeners[id] = callback
        return { listeners.remove(id); Unit }
    }

    fun simulateSleep(atMs: EpochMs) {
        for (cb in listeners.values.toList()) cb(atMs)
    }

    fun failStartWith(error: Exception) { failStartError = error }
}

data class ScheduledAlarm(val atMs: EpochMs, val kind: AlarmKind, val sessionId: String)

class RecordingAlarmScheduler : AlarmScheduler {
    val scheduled = mutableListOf<ScheduledAlarm>()
    var cancelAllCalls = 0; private set
    override fun schedule(atMs: EpochMs, kind: AlarmKind, sessionId: String) {
        scheduled.add(ScheduledAlarm(atMs, kind, sessionId))
    }
    override fun cancelAll() { cancelAllCalls += 1 }
}

class RecordingHaptics : HapticService {
    val played = mutableListOf<WakePattern>()
    var stopCount = 0; private set
    override fun playWake(pattern: WakePattern) { played.add(pattern) }
    override fun stop() { stopCount += 1 }
}

class InMemorySessionStore : SessionStore {
    var lastSaved: NapSessionSnapshot? = null; private set
    override fun load(): NapSessionSnapshot? = lastSaved
    override fun save(session: NapSessionSnapshot) { lastSaved = session.copy() }
    override fun clear() { lastSaved = null }
    fun seed(session: NapSessionSnapshot) { lastSaved = session.copy() }
}
