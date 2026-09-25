import Foundation
@testable import SiestaDomain

/// Vectors live in packages/test-vectors/vectors — resolved relative to this file.
let vectorsDir = URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent() // SiestaDomainTests
    .deletingLastPathComponent() // Tests
    .deletingLastPathComponent() // domain-apple
    .deletingLastPathComponent() // packages
    .appending(path: "test-vectors/vectors")

func loadVector<C: Decodable>(_ name: String, as: C.Type) throws -> VectorFile<C> {
    let url = vectorsDir.appending(path: "\(name).json")
    let data = try Data(contentsOf: url)
    return try JSONDecoder().decode(VectorFile<C>.self, from: data)
}

func loadJSON(_ name: String) throws -> Any {
    let url = vectorsDir.appending(path: "\(name).json")
    let data = try Data(contentsOf: url)
    return try JSONSerialization.jsonObject(with: data)
}

struct VectorFile<C: Decodable>: Decodable {
    let version: Int
    let cases: [C]
}

// MARK: - DTOs

struct EventDTO: Decodable {
    let type: String
    let minutes: Int?
    let atMs: Int64?
    let reason: String?

    var event: NapEvent {
        switch type {
        case "duration_selected": return .durationSelected(minutes: minutes!)
        case "start": return .start
        case "detector_ready": return .detectorReady
        case "sleep_detected": return .sleepDetected(atMs: atMs!)
        case "wake_due": return .wakeDue
        case "wake_acknowledged": return .wakeAcknowledged
        case "cancel": return .cancel
        case "error": return .error(reason: reason ?? "")
        case "reset": return .reset
        default: fatalError("unknown event type: \(type)")
        }
    }
}

struct TransitionCase: Decodable {
    let from: NapState
    let event: EventDTO
    let to: NapState
}

struct WakeCase: Decodable {
    let sleepDetectedAtMs: Int64
    let durationMinutes: Int
    let expectedWakeAtMs: Int64
}

struct FailSafeCase: Decodable {
    let armedAtMs: Int64
    let durationMinutes: Int
    let graceMinutes: Int
    let failSafeWakeAtMs: Int64
}

struct SampleDTO: Decodable {
    let atMs: Int64
    let heartRate: Double?
    let motion: Double?
}

struct OnsetCase: Decodable {
    let name: String
    let config: SleepOnsetConfig
    let samples: [SampleDTO]
    let expectedOnsetAtMs: Int64?
}

struct OpDTO: Decodable {
    let op: String
    let minutes: Int?
    let toMs: Int64?
    let atMs: Int64?
}

struct SessionDTO: Decodable, Equatable {
    let state: NapState
    let selectedDurationMinutes: Int
    let armedAtMs: Int64?
    let sleepDetectedAtMs: Int64?
    let expectedWakeAtMs: Int64?
    let failSafeWakeAtMs: Int64?
}

struct AlarmDTO: Decodable, Equatable {
    let atMs: Int64
    let kind: AlarmKind
    let sessionId: String
}

struct ExpectedDTO: Decodable {
    let state: NapState
    let session: SessionDTO?
    let remainingMs: Int64?
    let scheduledAlarms: [AlarmDTO]
    let wakePatternsPlayed: [WakePattern]
}

struct ScenarioCase: Decodable {
    let name: String
    let startMs: Int64
    let ops: [OpDTO]
    let expected: ExpectedDTO
}
