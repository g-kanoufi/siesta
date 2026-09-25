import Foundation

public enum WakeIntensity: String, Codable, CaseIterable {
    case gentle, normal, strong
}

public enum WakeStep: Equatable, Codable {
    case pulse(intensity: Double, durationMs: Int64)
    case pause(durationMs: Int64)

    private enum CodingKeys: String, CodingKey { case kind, intensity, durationMs }
    private enum Kind: String, Codable { case pulse, pause }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        switch try c.decode(Kind.self, forKey: .kind) {
        case .pulse:
            self = .pulse(
                intensity: try c.decode(Double.self, forKey: .intensity),
                durationMs: try c.decode(Int64.self, forKey: .durationMs)
            )
        case .pause:
            self = .pause(durationMs: try c.decode(Int64.self, forKey: .durationMs))
        }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case let .pulse(intensity, durationMs):
            try c.encode(Kind.pulse, forKey: .kind)
            try c.encode(intensity, forKey: .intensity)
            try c.encode(durationMs, forKey: .durationMs)
        case let .pause(durationMs):
            try c.encode(Kind.pause, forKey: .kind)
            try c.encode(durationMs, forKey: .durationMs)
        }
    }
}

/// Data, not code: the app maps pulses to WKInterfaceDevice.play types.
/// Constants vector (constants.json) pins these values against core.
public struct WakePattern: Equatable, Codable {
    public var steps: [WakeStep]
    public var repeatIntervalMs: Int64

    public init(steps: [WakeStep], repeatIntervalMs: Int64) {
        self.steps = steps
        self.repeatIntervalMs = repeatIntervalMs
    }
}

public let wakePatterns: [WakeIntensity: WakePattern] = [
    .gentle: .init(steps: [
        .pulse(intensity: 0.35, durationMs: 120),
        .pause(durationMs: 900),
        .pulse(intensity: 0.45, durationMs: 140),
        .pause(durationMs: 700),
        .pulse(intensity: 0.55, durationMs: 160),
        .pause(durationMs: 1400),
    ], repeatIntervalMs: 4000),
    .normal: .init(steps: [
        .pulse(intensity: 0.5, durationMs: 140),
        .pause(durationMs: 600),
        .pulse(intensity: 0.65, durationMs: 160),
        .pause(durationMs: 450),
        .pulse(intensity: 0.8, durationMs: 200),
        .pause(durationMs: 900),
    ], repeatIntervalMs: 3000),
    .strong: .init(steps: [
        .pulse(intensity: 0.65, durationMs: 160),
        .pause(durationMs: 350),
        .pulse(intensity: 0.85, durationMs: 200),
        .pause(durationMs: 250),
        .pulse(intensity: 1.0, durationMs: 280),
        .pulse(intensity: 1.0, durationMs: 200),
        .pause(durationMs: 500),
    ], repeatIntervalMs: 2400),
]

public func patternDurationMs(_ pattern: WakePattern) -> Int64 {
    pattern.steps.reduce(0) { sum, step in
        switch step {
        case let .pulse(_, durationMs), let .pause(durationMs): return sum + durationMs
        }
    }
}
