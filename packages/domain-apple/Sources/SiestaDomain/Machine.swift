import Foundation

/// Port of packages/core/src/machine.ts — keep transitions identical.
public enum NapState: String, Codable, CaseIterable, Equatable {
    case idle
    case selectingDuration = "selecting_duration"
    case armed
    case waitingForSleep = "waiting_for_sleep"
    case sleeping
    case waking
    case completed
    case cancelled
    case error
}

public enum NapEvent: Equatable {
    case durationSelected(minutes: Int)
    case start
    case detectorReady
    case sleepDetected(atMs: Int64)
    case wakeDue
    case wakeAcknowledged
    case cancel
    case error(reason: String)
    case reset
}

public let initialNapState: NapState = .idle

/// Pure, total transition. Unknown pairs are no-ops — async platform events
/// can arrive late and must never corrupt the session.
public func transition(_ state: NapState, _ event: NapEvent) -> NapState {
    switch state {
    case .idle:
        if case .durationSelected = event { return .selectingDuration }
        return state
    case .selectingDuration:
        switch event {
        case .durationSelected: return .selectingDuration
        case .start: return .armed
        case .cancel: return .idle
        default: return state
        }
    case .armed:
        switch event {
        case .detectorReady: return .waitingForSleep
        case .sleepDetected: return .sleeping
        case .cancel: return .cancelled
        case .error: return .error
        default: return state
        }
    case .waitingForSleep:
        switch event {
        case .sleepDetected: return .sleeping
        case .wakeDue: return .waking
        case .cancel: return .cancelled
        case .error: return .error
        default: return state
        }
    case .sleeping:
        switch event {
        case .wakeDue: return .waking
        case .cancel: return .cancelled
        case .error: return .error
        default: return state
        }
    case .waking:
        switch event {
        case .wakeAcknowledged, .cancel: return .completed
        default: return state
        }
    case .completed, .cancelled, .error:
        if case .reset = event { return .idle }
        return state
    }
}
