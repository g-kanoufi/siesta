package siesta

class InvalidDurationException(minutes: Int) : IllegalArgumentException("Invalid nap duration: $minutes")
class NoDurationSelectedException : IllegalStateException("start() requires a selected duration")

data class NapViewState(
    val state: NapState,
    val selectedDurationMinutes: Int?,
    val remainingMs: Long?,
    val nextDeadlineMs: EpochMs?,
)

/**
 * Port of packages/core/src/session.ts — orchestrates one nap through the
 * state machine, persists after every transition, delegates platform effects
 * to injected services. Behavior pinned by scenarios.json vectors.
 */
class NapSessionManager(
    private val clock: Clock,
    private val sleep: SleepDetectionService,
    private val scheduler: AlarmScheduler,
    private val haptics: HapticService,
    private val store: SessionStore,
    private val newId: () -> String = { "nap-${clock.nowMs()}" },
    private val failSafeGraceMinutes: Int = DEFAULT_FAIL_SAFE_GRACE_MINUTES,
    private val wakeIntensity: WakeIntensity = WakeIntensity.GENTLE,
) {
    var state: NapState = NapState.IDLE
        private set
    var snapshot: NapSessionSnapshot? = null
        private set
    var lastError: String? = null
        private set

    private var pendingMinutes: Int? = null
    private val listeners = mutableMapOf<Int, (NapSessionSnapshot?) -> Unit>()
    private var nextListenerId = 0
    private var unsubscribeDetection: (() -> Unit)? = null

    fun selectDuration(minutes: Int) {
        if (!isValidDuration(minutes)) throw InvalidDurationException(minutes)
        if (state != NapState.IDLE && state != NapState.SELECTING_DURATION) return
        pendingMinutes = minutes
        dispatch(NapEvent.DurationSelected(minutes))
    }

    /** Arm detection and wait for sleep. Requires a selected duration. */
    suspend fun start() {
        val minutes = pendingMinutes
        if (state != NapState.SELECTING_DURATION || minutes == null) {
            throw NoDurationSelectedException()
        }
        val now = clock.nowMs()
        snapshot = NapSessionSnapshot(
            id = newId(),
            selectedDurationMinutes = minutes,
            state = state,
            armedAtMs = now,
            failSafeWakeAtMs = computeFailSafeWakeAtMs(now, minutes, failSafeGraceMinutes),
        )
        dispatch(NapEvent.Start)
        wireDetection()
        try {
            sleep.start()
        } catch (e: Exception) {
            lastError = e.message ?: "unknown"
            dispatch(NapEvent.Error(lastError!!))
            persist()
            return
        }
        dispatch(NapEvent.DetectorReady)
        scheduler.schedule(snapshot!!.failSafeWakeAtMs!!, AlarmKind.FAIL_SAFE, snapshot!!.id)
        persist()
    }

    /** Manual fallback: no detector, countdown starts now. */
    fun startManually() {
        val minutes = pendingMinutes
        if (state != NapState.SELECTING_DURATION || minutes == null) {
            throw NoDurationSelectedException()
        }
        val now = clock.nowMs()
        snapshot = NapSessionSnapshot(
            id = newId(),
            selectedDurationMinutes = minutes,
            state = state,
            armedAtMs = now,
            failSafeWakeAtMs = computeFailSafeWakeAtMs(now, minutes, 0),
        )
        dispatch(NapEvent.Start)
        onSleepDetected(now)
    }

    fun cancel() {
        dispatch(NapEvent.Cancel)
        if (state == NapState.CANCELLED || state == NapState.COMPLETED) {
            teardown()
        }
        persist()
    }

    fun acknowledgeWake() {
        dispatch(NapEvent.WakeAcknowledged)
        if (state == NapState.COMPLETED) {
            haptics.stop()
            persist()
        }
    }

    /** Reset a finished/cancelled/errored session back to idle. */
    fun dismiss() {
        dispatch(NapEvent.Reset)
        if (state == NapState.IDLE) {
            teardown()
            snapshot = null
            pendingMinutes = null
            lastError = null
            persist()
        }
    }

    /** Advance time. Call on tick, on foreground, on scheduler wake. */
    fun tick() {
        val deadline = snapshot?.let { nextDeadlineMs(it) } ?: return
        if (clock.nowMs() >= deadline) fireWakeDue()
    }

    fun remainingMs(): Long? = snapshot?.let { remainingMs(it, clock.nowMs()) }

    fun view(): NapViewState = NapViewState(
        state = state,
        selectedDurationMinutes = snapshot?.selectedDurationMinutes ?: pendingMinutes,
        remainingMs = remainingMs(),
        nextDeadlineMs = snapshot?.let { nextDeadlineMs(it) },
    )

    fun subscribe(listener: (NapSessionSnapshot?) -> Unit): () -> Unit {
        val id = nextListenerId++
        listeners[id] = listener
        return { listeners.remove(id); Unit }
    }

    private fun onSleepDetected(atMs: EpochMs) {
        dispatch(NapEvent.SleepDetected(atMs))
        if (state != NapState.SLEEPING) return
        val s = snapshot ?: return
        val updated = s.copy(
            sleepDetectedAtMs = atMs,
            expectedWakeAtMs = computeWakeAtMs(atMs, s.selectedDurationMinutes),
        )
        snapshot = updated
        sleep.stop()
        scheduler.cancelAll()
        scheduler.schedule(updated.expectedWakeAtMs!!, AlarmKind.NAP_WAKE, updated.id)
        persist()
    }

    private fun wireDetection() {
        unsubscribeDetection = sleep.onSleepDetected { atMs -> onSleepDetected(atMs) }
    }

    private suspend fun rearmDetection() {
        wireDetection()
        try {
            sleep.start()
        } catch (e: Exception) {
            lastError = e.message ?: "unknown"
            dispatch(NapEvent.Error(lastError!!))
        }
    }

    private fun fireWakeDue() {
        dispatch(NapEvent.WakeDue)
        if (state == NapState.WAKING) {
            haptics.playWake(wakePatterns.getValue(wakeIntensity))
            persist()
        }
    }

    private fun dispatch(event: NapEvent) {
        val next = transition(state, event)
        if (next == state) return
        state = next
        snapshot?.let { it.state = next }
        emit()
    }

    private fun teardown() {
        unsubscribeDetection?.invoke()
        unsubscribeDetection = null
        sleep.stop()
        scheduler.cancelAll()
        haptics.stop()
    }

    private fun persist() {
        val s = snapshot
        if (s == null || state == NapState.IDLE) {
            store.clear()
            return
        }
        store.save(s)
    }

    private fun emit() {
        for (listener in listeners.values) listener(snapshot)
    }

    companion object {
        /** Rebuild after process death — a nap never silently disappears. */
        suspend fun resume(
            clock: Clock,
            sleep: SleepDetectionService,
            scheduler: AlarmScheduler,
            haptics: HapticService,
            store: SessionStore,
            newId: () -> String = { "nap-${clock.nowMs()}" },
            failSafeGraceMinutes: Int = DEFAULT_FAIL_SAFE_GRACE_MINUTES,
            wakeIntensity: WakeIntensity = WakeIntensity.GENTLE,
        ): NapSessionManager {
            val m = NapSessionManager(
                clock, sleep, scheduler, haptics, store, newId,
                failSafeGraceMinutes, wakeIntensity,
            )
            val s = store.load() ?: return m

            m.snapshot = s
            m.state = s.state
            val now = clock.nowMs()

            when (s.state) {
                NapState.SLEEPING ->
                    if (s.expectedWakeAtMs != null && now >= s.expectedWakeAtMs) {
                        m.fireWakeDue()
                    }
                NapState.ARMED, NapState.WAITING_FOR_SLEEP -> {
                    if (s.state == NapState.ARMED) m.dispatch(NapEvent.DetectorReady)
                    if (s.failSafeWakeAtMs != null && now >= s.failSafeWakeAtMs) {
                        m.fireWakeDue()
                    } else {
                        m.rearmDetection()
                    }
                }
                NapState.WAKING -> haptics.playWake(wakePatterns.getValue(wakeIntensity))
                else -> {
                    store.clear()
                    m.snapshot = null
                    m.state = NapState.IDLE
                }
            }
            return m
        }
    }
}
