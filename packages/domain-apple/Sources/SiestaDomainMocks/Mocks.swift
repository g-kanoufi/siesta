import Foundation
import SiestaDomain

public final class ManualClock: Clock {
    private var current: EpochMs
    public init(_ startMs: EpochMs) { current = startMs }
    public func nowMs() -> EpochMs { current }
    public func set(_ ms: EpochMs) { current = ms }
    public func advance(_ deltaMs: Int64) { current += deltaMs }
}

/// Dev/test detector. `simulateSleep` is the "Simulate sleep" dev control.
public final class MockSleepDetectionService: SleepDetectionService {
    public private(set) var startCalls = 0
    public private(set) var stopDetectionCalls = 0
    public private(set) var stopCalls = 0
    public private(set) var running = false
    private var failStartError: Error?
    private var listeners: [UUID: (EpochMs) -> Void] = [:]

    public init() {}

    public func start() async throws {
        startCalls += 1
        if let failStartError { throw failStartError }
        running = true
    }

    public func stopDetection() {
        stopDetectionCalls += 1
    }

    public func stop() {
        if running {
            stopCalls += 1
            running = false
        }
    }

    public func onSleepDetected(_ callback: @escaping (EpochMs) -> Void) -> () -> Void {
        let id = UUID()
        listeners[id] = callback
        return { [weak self] in self?.listeners[id] = nil }
    }

    public func simulateSleep(atMs: EpochMs) {
        for cb in listeners.values { cb(atMs) }
    }

    public func failStartWith(_ error: Error) { failStartError = error }
}

public struct ScheduledAlarm: Equatable, Codable {
    public var atMs: EpochMs
    public var kind: AlarmKind
    public var sessionId: String

    public init(atMs: EpochMs, kind: AlarmKind, sessionId: String) {
        self.atMs = atMs
        self.kind = kind
        self.sessionId = sessionId
    }
}

public final class RecordingAlarmScheduler: AlarmScheduler {
    public private(set) var scheduled: [ScheduledAlarm] = []
    public private(set) var cancelAllCalls = 0
    public init() {}
    public func schedule(atMs: EpochMs, kind: AlarmKind, sessionId: String) {
        scheduled.append(ScheduledAlarm(atMs: atMs, kind: kind, sessionId: sessionId))
    }
    public func cancelAll() { cancelAllCalls += 1 }
}

public final class RecordingHaptics: HapticService {
    public private(set) var played: [WakePattern] = []
    public private(set) var stopCount = 0
    public init() {}
    public func playWake(_ pattern: WakePattern) { played.append(pattern) }
    public func stop() { stopCount += 1 }
}

public final class InMemorySessionStore: SessionStore {
    public private(set) var lastSaved: NapSessionSnapshot?
    public init() {}
    public func load() -> NapSessionSnapshot? { lastSaved }
    public func save(_ session: NapSessionSnapshot) { lastSaved = session }
    public func clear() { lastSaved = nil }
    public func seed(_ session: NapSessionSnapshot) { lastSaved = session }
}
