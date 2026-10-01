import Foundation

public enum SiestaError: Error, Equatable {
    case invalidDuration(Int)
    case noDurationSelected
}

public struct NapViewState: Equatable {
    public var state: NapState
    public var selectedDurationMinutes: Int?
    public var remainingMs: Int64?
    public var nextDeadlineMs: EpochMs?
}

/**
 * Port of packages/core/src/session.ts — orchestrates one nap through the
 * state machine, persists after every transition, delegates platform effects
 * to injected services. Behavior pinned by scenarios.json vectors.
 */
public final class NapSessionManager {
    public private(set) var state: NapState = .idle
    public private(set) var snapshot: NapSessionSnapshot?
    public private(set) var lastError: String?

    private var pendingMinutes: Int?
    private var listeners: [UUID: (NapSessionSnapshot?) -> Void] = [:]
    private var unsubscribeDetection: (() -> Void)?

    private let clock: Clock
    private let sleep: SleepDetectionService
    private let scheduler: AlarmScheduler
    private let haptics: HapticService
    private let store: SessionStore
    private let newId: () -> String
    private let failSafeGraceMinutes: Int
    private let wakeIntensity: WakeIntensity

    public init(
        clock: Clock,
        sleep: SleepDetectionService,
        scheduler: AlarmScheduler,
        haptics: HapticService,
        store: SessionStore,
        newId: @escaping () -> String = { "nap-\(UUID().uuidString)" },
        failSafeGraceMinutes: Int = defaultFailSafeGraceMinutes,
        wakeIntensity: WakeIntensity = .gentle
    ) {
        self.clock = clock
        self.sleep = sleep
        self.scheduler = scheduler
        self.haptics = haptics
        self.store = store
        self.newId = newId
        self.failSafeGraceMinutes = failSafeGraceMinutes
        self.wakeIntensity = wakeIntensity
    }

    public func selectDuration(_ minutes: Int) throws {
        guard isValidDuration(minutes) else { throw SiestaError.invalidDuration(minutes) }
        guard state == .idle || state == .selectingDuration else { return }
        pendingMinutes = minutes
        dispatch(.durationSelected(minutes: minutes))
    }

    /// Arm detection and wait for sleep. Requires a selected duration.
    public func start() async throws {
        guard state == .selectingDuration, let minutes = pendingMinutes else {
            throw SiestaError.noDurationSelected
        }
        let now = clock.nowMs()
        snapshot = NapSessionSnapshot(
            id: newId(),
            selectedDurationMinutes: minutes,
            state: state,
            armedAtMs: now,
            failSafeWakeAtMs: computeFailSafeWakeAtMs(
                armedAtMs: now,
                durationMinutes: minutes,
                graceMinutes: failSafeGraceMinutes
            )
        )
        dispatch(.start)
        wireDetection()
        do {
            try await sleep.start()
        } catch {
            lastError = error.localizedDescription
            dispatch(.error(reason: lastError!))
            persist()
            return
        }
        dispatch(.detectorReady)
        scheduler.schedule(
            atMs: snapshot!.failSafeWakeAtMs!,
            kind: .failSafe,
            sessionId: snapshot!.id
        )
        persist()
    }

    /// Manual fallback: no detector, countdown starts now.
    public func startManually() throws {
        guard state == .selectingDuration, let minutes = pendingMinutes else {
            throw SiestaError.noDurationSelected
        }
        let now = clock.nowMs()
        snapshot = NapSessionSnapshot(
            id: newId(),
            selectedDurationMinutes: minutes,
            state: state,
            armedAtMs: now,
            failSafeWakeAtMs: computeFailSafeWakeAtMs(
                armedAtMs: now,
                durationMinutes: minutes,
                graceMinutes: 0
            )
        )
        dispatch(.start)
        onSleepDetected(atMs: now)
    }

    public func cancel() {
        dispatch(.cancel)
        if state == .cancelled || state == .completed {
            teardown()
        }
        persist()
    }

    public func acknowledgeWake() {
        dispatch(.wakeAcknowledged)
        if state == .completed {
            haptics.stop()
            persist()
        }
    }

    /// Reset a finished/cancelled/errored session back to idle.
    public func dismiss() {
        dispatch(.reset)
        if state == .idle {
            teardown()
            snapshot = nil
            pendingMinutes = nil
            lastError = nil
            persist()
        }
    }

    /// Advance time. Call on tick, on foreground, on scheduler wake.
    public func tick() {
        guard let s = snapshot, let deadline = nextDeadlineMs(s) else { return }
        if clock.nowMs() >= deadline {
            fireWakeDue()
        }
    }

    public func remainingMs() -> Int64? {
        guard let s = snapshot else { return nil }
        return snapshotRemainingMs(s, nowMs: clock.nowMs())
    }

    public func view() -> NapViewState {
        NapViewState(
            state: state,
            selectedDurationMinutes: snapshot?.selectedDurationMinutes ?? pendingMinutes,
            remainingMs: remainingMs(),
            nextDeadlineMs: snapshot.flatMap { nextDeadlineMs($0) }
        )
    }

    @discardableResult
    public func subscribe(_ listener: @escaping (NapSessionSnapshot?) -> Void) -> () -> Void {
        let id = UUID()
        listeners[id] = listener
        return { [weak self] in self?.listeners[id] = nil }
    }

    /// Rebuild after process death — a nap never silently disappears.
    public static func resume(
        clock: Clock,
        sleep: SleepDetectionService,
        scheduler: AlarmScheduler,
        haptics: HapticService,
        store: SessionStore,
        newId: @escaping () -> String = { "nap-\(UUID().uuidString)" },
        failSafeGraceMinutes: Int = defaultFailSafeGraceMinutes,
        wakeIntensity: WakeIntensity = .gentle
    ) async -> NapSessionManager {
        let m = NapSessionManager(
            clock: clock, sleep: sleep, scheduler: scheduler, haptics: haptics,
            store: store, newId: newId,
            failSafeGraceMinutes: failSafeGraceMinutes, wakeIntensity: wakeIntensity
        )
        guard let s = store.load() else { return m }

        m.snapshot = s
        m.state = s.state
        let now = clock.nowMs()

        switch s.state {
        case .sleeping:
            if let wake = s.expectedWakeAtMs, now >= wake {
                m.fireWakeDue()
            }
        case .armed, .waitingForSleep:
            if s.state == .armed {
                m.dispatch(.detectorReady)
            }
            if let failSafe = s.failSafeWakeAtMs, now >= failSafe {
                m.fireWakeDue()
            } else {
                await m.rearmDetection()
            }
        case .waking:
            haptics.playWake(wakePatterns[wakeIntensity]!)
        default:
            store.clear()
            m.snapshot = nil
            m.state = .idle
        }
        return m
    }

    private func onSleepDetected(atMs: EpochMs) {
        dispatch(.sleepDetected(atMs: atMs))
        guard state == .sleeping, var s = snapshot else { return }
        s.sleepDetectedAtMs = atMs
        s.expectedWakeAtMs = computeWakeAtMs(
            sleepDetectedAtMs: atMs,
            durationMinutes: s.selectedDurationMinutes
        )
        snapshot = s
        sleep.stopDetection()
        scheduler.cancelAll()
        scheduler.schedule(atMs: s.expectedWakeAtMs!, kind: .napWake, sessionId: s.id)
        persist()
    }

    private func wireDetection() {
        unsubscribeDetection = sleep.onSleepDetected { [weak self] atMs in
            self?.onSleepDetected(atMs: atMs)
        }
    }

    private func rearmDetection() async {
        wireDetection()
        do {
            try await sleep.start()
        } catch {
            lastError = error.localizedDescription
            dispatch(.error(reason: lastError!))
        }
    }

    private func fireWakeDue() {
        dispatch(.wakeDue)
        if state == .waking {
            haptics.playWake(wakePatterns[wakeIntensity]!)
            persist()
        }
    }

    private func dispatch(_ event: NapEvent) {
        let next = transition(state, event)
        if next == state { return }
        state = next
        if snapshot != nil { snapshot!.state = next }
        emit()
    }

    private func teardown() {
        unsubscribeDetection?()
        unsubscribeDetection = nil
        sleep.stop()
        scheduler.cancelAll()
        haptics.stop()
    }

    private func persist() {
        if snapshot == nil || state == .idle {
            store.clear()
            return
        }
        store.save(snapshot!)
    }

    private func emit() {
        for listener in listeners.values { listener(snapshot) }
    }
}
