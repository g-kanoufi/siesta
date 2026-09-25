import Foundation

public struct PhysioSample {
    public var atMs: EpochMs
    public var heartRate: Double?
    public var motion: Double?

    public init(atMs: EpochMs, heartRate: Double? = nil, motion: Double? = nil) {
        self.atMs = atMs
        self.heartRate = heartRate
        self.motion = motion
    }
}

public struct SleepOnsetConfig: Codable, Equatable {
    public var baselineWindowMs: Int64
    public var confirmationWindowMs: Int64
    public var heartRateDropFraction: Double
    public var motionThreshold: Double

    public init(baselineWindowMs: Int64 = 120_000,
                confirmationWindowMs: Int64 = 180_000,
                heartRateDropFraction: Double = 0.08,
                motionThreshold: Double = 0.05) {
        self.baselineWindowMs = baselineWindowMs
        self.confirmationWindowMs = confirmationWindowMs
        self.heartRateDropFraction = heartRateDropFraction
        self.motionThreshold = motionThreshold
    }
}

public let defaultOnsetConfig = SleepOnsetConfig()

/**
 * Sleep-onset heuristic — an estimate, never a claim. See the TypeScript
 * original (packages/core/src/sleepOnset.ts) for the phase description;
 * this port must behave identically, proven by onset.json vectors.
 */
public final class SleepOnsetDetector {
    private let config: SleepOnsetConfig
    private var sessionStartMs: EpochMs?
    private var baselineSum: Double = 0
    private var baselineCount = 0
    private var baselineHr: Double?
    private var qualifyingStartMs: EpochMs?
    public private(set) var onsetAtMs: EpochMs?

    public init(config: SleepOnsetConfig = defaultOnsetConfig) {
        self.config = config
    }

    public func feed(_ sample: PhysioSample) {
        if onsetAtMs != nil { return }
        if sessionStartMs == nil { sessionStartMs = sample.atMs }

        let inBaseline = sample.atMs - sessionStartMs! < config.baselineWindowMs
        if inBaseline {
            if let hr = sample.heartRate {
                baselineSum += hr
                baselineCount += 1
            }
            return
        }

        if baselineHr == nil && baselineCount > 0 {
            baselineHr = baselineSum / Double(baselineCount)
        }

        let hrOk: Bool
        if let hr = sample.heartRate {
            hrOk = baselineHr != nil &&
                hr <= baselineHr! * (1 - config.heartRateDropFraction)
        } else {
            hrOk = baselineHr == nil // motion-only mode
        }
        let motionOk = sample.motion == nil || sample.motion! <= config.motionThreshold

        if hrOk && motionOk {
            if qualifyingStartMs == nil { qualifyingStartMs = sample.atMs }
            if sample.atMs - qualifyingStartMs! >= config.confirmationWindowMs {
                onsetAtMs = qualifyingStartMs
            }
        } else {
            qualifyingStartMs = nil
        }
    }

    public func reset() {
        sessionStartMs = nil
        baselineSum = 0
        baselineCount = 0
        baselineHr = nil
        qualifyingStartMs = nil
        onsetAtMs = nil
    }
}
