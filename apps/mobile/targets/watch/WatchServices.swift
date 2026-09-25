import Foundation
import HealthKit
import UserNotifications
import WatchKit

enum WatchServiceError: Error {
    case healthDataUnavailable
}

// MARK: - Persistence

/// App Group UserDefaults — survives process death and is visible to the
/// paired iPhone app for companion display.
final class UserDefaultsSessionStore: SessionStore {
    private let defaults = UserDefaults(suiteName: "group.app.siesta") ?? .standard
    private let key = "siesta.session.v1"

    func load() -> NapSessionSnapshot? {
        guard let data = defaults.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(NapSessionSnapshot.self, from: data)
    }

    func save(_ session: NapSessionSnapshot) {
        if let data = try? JSONEncoder().encode(session) {
            defaults.set(data, forKey: key)
        }
    }

    func clear() {
        defaults.removeObject(forKey: key)
    }
}

// MARK: - Scheduled wake

/// Local notifications are the durable scheduled-wake channel — they fire
/// even if the workout session ends or the app is suspended.
final class NotificationAlarmScheduler: AlarmScheduler {
    private let center = UNUserNotificationCenter.current()

    func schedule(atMs: EpochMs, kind: AlarmKind, sessionId: String) {
        let content = UNMutableNotificationContent()
        content.title = "Siesta"
        // Wake is haptic by default; sound stays off (PRIVACY.md: quiet product).
        content.body = kind == .napWake
            ? "Your siesta is over."
            : "Couldn't detect sleep — waking you now."
        let delay = max(1, TimeInterval(atMs - SystemClock().nowMs()) / 1000)
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: delay, repeats: false)
        center.add(UNNotificationRequest(
            identifier: "\(kind.rawValue)-\(sessionId)",
            content: content,
            trigger: trigger
        ))
    }

    func cancelAll() {
        center.removeAllPendingNotificationRequests()
    }
}

// MARK: - Haptics

/// WakePattern steps map to semantic WKHapticTypes. Pulse durations become
/// real delays so the felt rhythm matches the shared pattern math.
final class WatchHaptics: HapticService {
    private var task: Task<Void, Never>?

    func playWake(_ pattern: WakePattern) {
        task?.cancel()
        let intervalMs = pattern.repeatIntervalMs
        task = Task {
            while !Task.isCancelled {
                for step in pattern.steps {
                    if Task.isCancelled { return }
                    switch step {
                    case let .pulse(intensity, durationMs):
                        WKInterfaceDevice.current().play(Self.type(for: intensity))
                        await Self.sleep(durationMs)
                    case let .pause(durationMs):
                        await Self.sleep(durationMs)
                    }
                }
                // Keep the gap between cycles so the cadence stays honest.
                await Self.sleep(max(0, intervalMs - patternDurationMs(pattern)))
            }
        }
    }

    func stop() {
        task?.cancel()
        task = nil
    }

    private static func type(for intensity: Double) -> WKHapticType {
        switch intensity {
        case ..<0.5: return .click
        case ..<0.85: return .directionUp
        default: return .notification
        }
    }

    private static func sleep(_ ms: Int64) async {
        try? await Task.sleep(nanoseconds: UInt64(max(0, ms)) * 1_000_000)
    }
}

// MARK: - Sleep detection

/// Heart rate is the primary onset signal: wrist motion on watchOS saturates
/// within minutes of stillness, so a workout session keeps HR streaming and
/// the SleepOnsetDetector applies the shared heuristic.
///
/// Honest limitation: this is a heuristic, not a polysomnograph. The UI copy
/// must never claim medical-grade detection (see docs/adr/0003).
final class HealthKitSleepDetector: SleepDetectionService {
    private let store = HKHealthStore()
    private var workout: HKWorkoutSession?
    private var query: HKAnchoredObjectQuery?
    private var detector = SleepOnsetDetector()
    private var listeners: [UUID: (EpochMs) -> Void] = [:]

    func start() async throws {
        guard HKHealthStore.isHealthDataAvailable() else {
            throw WatchServiceError.healthDataUnavailable
        }
        let heartRate = HKQuantityType(.heartRate)
        try await store.requestAuthorization(
            toShare: [HKObjectType.workoutType()],
            read: [heartRate]
        )

        // The workout session keeps the app alive and HR streaming in the
        // background for the whole nap — required for real-time detection.
        let config = HKWorkoutConfiguration()
        config.activityType = .mindAndBody
        config.locationType = .indoor
        let session = try HKWorkoutSession(healthStore: store, configuration: config)
        session.startActivity(with: Date())
        self.workout = session

        detector = SleepOnsetDetector()
        let q = HKAnchoredObjectQuery(
            type: heartRate,
            predicate: HKQuery.predicateForSamples(
                withStart: Date(), end: nil, options: .strictStartDate
            ),
            anchor: nil,
            limit: HKObjectQueryNoLimit
        ) { [weak self] _, samples, _, _, _ in
            self?.ingest(samples)
        }
        q.updateHandler = { [weak self] _, samples, _, _, _ in
            self?.ingest(samples)
        }
        query = q
        store.execute(q)
    }

    func stop() {
        if let q = query { store.stop(q) }
        query = nil
        workout?.end()
        workout = nil
        detector.reset()
    }

    func onSleepDetected(_ callback: @escaping (EpochMs) -> Void) -> () -> Void {
        let id = UUID()
        listeners[id] = callback
        return { self.listeners[id] = nil }
    }

    private func ingest(_ samples: [HKSample]?) {
        guard let quantities = samples as? [HKQuantitySample] else { return }
        for s in quantities {
            let bpm = s.quantity.doubleValue(
                for: HKUnit.count().unitDivided(by: .minute())
            )
            detector.feed(PhysioSample(
                atMs: Int64(s.startDate.timeIntervalSince1970 * 1000),
                heartRate: bpm
            ))
        }
        if let onset = detector.onsetAtMs {
            detector.reset()
            listeners.values.forEach { $0(onset) }
        }
    }
}
