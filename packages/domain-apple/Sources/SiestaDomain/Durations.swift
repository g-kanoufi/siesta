import Foundation

public let minNapMinutes = 5
public let maxNapMinutes = 120
public let defaultDurationMinutes = 20

public struct NapDurationPreset: Codable, Equatable {
    public let minutes: Int
    public let id: String
    public let shortLabel: String
    public let description: String
    public let recommended: Bool?

    public init(minutes: Int, id: String, shortLabel: String, description: String, recommended: Bool? = nil) {
        self.minutes = minutes
        self.id = id
        self.shortLabel = shortLabel
        self.description = description
        self.recommended = recommended
    }
}

/// Mirrors NAP_DURATION_PRESETS in @siesta/core — the constants.json vector
/// asserts parity, so keep this table identical.
public let napDurationPresets: [NapDurationPreset] = [
    .init(minutes: 10, id: "quick-reset", shortLabel: "10 min", description: "Quick reset"),
    .init(minutes: 15, id: "short-break", shortLabel: "15 min", description: "Short break"),
    .init(minutes: 20, id: "power-nap", shortLabel: "20 min", description: "Classic power nap", recommended: true),
    .init(minutes: 25, id: "extended-rest", shortLabel: "25 min", description: "Extended rest"),
    .init(minutes: 30, id: "longer-recharge", shortLabel: "30 min", description: "Longer recharge"),
    .init(minutes: 45, id: "deep-rest", shortLabel: "45 min", description: "Deep rest"),
    .init(minutes: 60, id: "full-hour", shortLabel: "60 min", description: "A full hour"),
    .init(minutes: 90, id: "sleep-cycle", shortLabel: "90 min", description: "Full sleep cycle"),
]

public func presetFor(minutes: Int) -> NapDurationPreset? {
    napDurationPresets.first { $0.minutes == minutes }
}

public func isValidDuration(_ minutes: Int) -> Bool {
    minutes >= minNapMinutes && minutes <= maxNapMinutes
}
