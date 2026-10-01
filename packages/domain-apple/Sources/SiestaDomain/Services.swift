import Foundation

public protocol Clock {
    func nowMs() -> EpochMs
}

public struct SystemClock: Clock {
    public init() {}
    public func nowMs() -> EpochMs { Int64(Date().timeIntervalSince1970 * 1000) }
}

/// Platform boundary — implementations wrap HKWorkoutSession,
/// UNUserNotificationCenter, and WKInterfaceDevice. The domain sees only
/// these contracts (dependency inversion).
///
/// Only `start` is async: HealthKit authorization is genuinely async.
/// Everything else maps to synchronous platform calls, which keeps the
/// session manager fully deterministic — critical for replaying vectors.
public protocol SleepDetectionService {
    func start() async throws
    func stopDetection()
    func stop()
    /// Returns an unsubscribe closure.
    func onSleepDetected(_ callback: @escaping (EpochMs) -> Void) -> () -> Void
}

public extension SleepDetectionService {
    func stopDetection() {
        stop()
    }
}

public enum AlarmKind: String, Codable {
    case napWake = "nap_wake"
    case failSafe = "fail_safe"
}

public protocol AlarmScheduler {
    func schedule(atMs: EpochMs, kind: AlarmKind, sessionId: String)
    func cancelAll()
}

public protocol HapticService {
    func playWake(_ pattern: WakePattern)
    func stop()
}

public protocol SessionStore {
    func load() -> NapSessionSnapshot?
    func save(_ session: NapSessionSnapshot)
    func clear()
}
