import Foundation

public typealias EpochMs = Int64

public let minuteMs: Int64 = 60_000
public let defaultFailSafeGraceMinutes = 15

/// Epoch-ms arithmetic: "20 minutes" is 20 elapsed minutes regardless of
/// midnight, DST transitions, or timezone changes.
public func computeWakeAtMs(sleepDetectedAtMs: EpochMs, durationMinutes: Int) -> EpochMs {
    sleepDetectedAtMs + Int64(durationMinutes) * minuteMs
}

public func computeFailSafeWakeAtMs(
    armedAtMs: EpochMs,
    durationMinutes: Int,
    graceMinutes: Int = defaultFailSafeGraceMinutes
) -> EpochMs {
    armedAtMs + Int64(durationMinutes + graceMinutes) * minuteMs
}

/// The persisted nap session — same shape as NapSessionSnapshot in core.
public struct NapSessionSnapshot: Codable, Equatable {
    public var id: String
    public var selectedDurationMinutes: Int
    public var state: NapState
    public var armedAtMs: EpochMs?
    public var sleepDetectedAtMs: EpochMs?
    public var expectedWakeAtMs: EpochMs?
    /// armedAt + duration + grace — the latest the user can possibly sleep.
    public var failSafeWakeAtMs: EpochMs?

    public init(id: String, selectedDurationMinutes: Int, state: NapState,
                armedAtMs: EpochMs? = nil, sleepDetectedAtMs: EpochMs? = nil,
                expectedWakeAtMs: EpochMs? = nil, failSafeWakeAtMs: EpochMs? = nil) {
        self.id = id
        self.selectedDurationMinutes = selectedDurationMinutes
        self.state = state
        self.armedAtMs = armedAtMs
        self.sleepDetectedAtMs = sleepDetectedAtMs
        self.expectedWakeAtMs = expectedWakeAtMs
        self.failSafeWakeAtMs = failSafeWakeAtMs
    }
}

/// The next deadline that can move the session into `waking`.
public func nextDeadlineMs(_ s: NapSessionSnapshot) -> EpochMs? {
    switch s.state {
    case .waitingForSleep: return s.failSafeWakeAtMs
    case .sleeping: return s.expectedWakeAtMs
    default: return nil
    }
}

/// Countdown for the sleeping state. Clamped at 0; nil when no deadline.
public func remainingMs(_ s: NapSessionSnapshot, nowMs: EpochMs) -> Int64? {
    guard let deadline = nextDeadlineMs(s) else { return nil }
    return max(0, deadline - nowMs)
}
