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
        guard let data = defaults.data(forKey: key) else {
            ProbeLog.shared.log("snapshot_load", ["found": false])
            return nil
        }
        let snapshot = try? JSONDecoder().decode(NapSessionSnapshot.self, from: data)
        ProbeLog.shared.log("snapshot_load", [
            "found": snapshot != nil,
            "state": snapshot?.state.rawValue ?? "corrupt",
        ])
        return snapshot
    }

    func save(_ session: NapSessionSnapshot) {
        if let data = try? JSONEncoder().encode(session) {
            defaults.set(data, forKey: key)
            ProbeLog.shared.log("snapshot_save", ["state": session.state.rawValue])
        }
    }

    func clear() {
        defaults.removeObject(forKey: key)
        ProbeLog.shared.log("snapshot_clear")
    }
}

// MARK: - Scheduled wake

/// Local notifications are the durable scheduled-wake channel — they fire
/// even if the workout session ends or the app is suspended. The delegate
/// also observes deliveries, which is how the probe measures real alarm
/// latency (scheduled vs. actually felt) and whether a notification reached
/// the wrist while the app was frontmost, backgrounded, or dead.
final class NotificationAlarmScheduler: NSObject, AlarmScheduler, UNUserNotificationCenterDelegate {
    private let center = UNUserNotificationCenter.current()

    override init() {
        super.init()
        center.delegate = self
        // A scheduled notification that cannot alert is not a wake channel —
        // authorization is requested at scheduler construction and logged.
        center.requestAuthorization(options: [.alert, .sound]) { granted, error in
            ProbeLog.shared.log("notification_auth", [
                "granted": granted,
                "error": error?.localizedDescription ?? "",
            ])
        }
        // Delivered-but-unseen notifications from a killed run still answer
        // "did the alarm fire while the app was dead?" on next launch.
        center.getDeliveredNotifications { delivered in
            for n in delivered where n.request.identifier.hasPrefix("nap_wake-")
                || n.request.identifier.hasPrefix("fail_safe-") {
                ProbeLog.shared.log("alarm_delivered_while_away", [
                    "requestId": n.request.identifier,
                    "deliveredAt": Int64(n.date.timeIntervalSince1970 * 1000),
                ])
            }
        }
    }

    func schedule(atMs: EpochMs, kind: AlarmKind, sessionId: String) {
        let content = UNMutableNotificationContent()
        content.title = "Siesta"
        // Wake is haptic by default; sound stays off (PRIVACY.md: quiet product).
        content.body = kind == .napWake
            ? "Your siesta is over."
            : "Couldn't detect sleep — waking you now."
        content.userInfo = ["siestaAtMs": atMs, "kind": kind.rawValue]
        let delay = max(1, TimeInterval(atMs - SystemClock().nowMs()) / 1000)
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: delay, repeats: false)
        center.add(UNNotificationRequest(
            identifier: "\(kind.rawValue)-\(sessionId)",
            content: content,
            trigger: trigger
        )) { error in
            ProbeLog.shared.log("alarm_scheduled", [
                "channel": "notification",
                "kind": kind.rawValue,
                "atMs": atMs,
                "error": error?.localizedDescription ?? "",
            ])
        }
    }

    func cancelAll() {
        center.getPendingNotificationRequests { pending in
            ProbeLog.shared.log("alarm_cancelled", [
                "channel": "notification",
                "pending": pending.count,
            ])
        }
        center.removeAllPendingNotificationRequests()
    }

    // MARK: UNUserNotificationCenterDelegate

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        logDelivery(notification, event: "alarm_delivered")
        // Present even while frontmost — a suppressed wake notification is a
        // silent failure for a nap product.
        completionHandler([.banner, .sound])
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        logDelivery(response.notification, event: "alarm_opened")
        completionHandler()
    }

    private func logDelivery(_ notification: UNNotification, event: String) {
        let info = notification.request.content.userInfo
        var d: [String: Any] = [
            "kind": info["kind"] as? String ?? "",
            "requestId": notification.request.identifier,
            "deliveredAt": Int64(notification.date.timeIntervalSince1970 * 1000),
        ]
        if let at = (info["siestaAtMs"] as? NSNumber)?.int64Value {
            d["lateMs"] = Int64(Date().timeIntervalSince1970 * 1000) - at
        }
        d.merge(ProbeEnv.capture()) { _, new in new }
        ProbeLog.shared.log(event, d)
    }
}

/// Smart-alarm extended runtime session — a second, independent wake channel.
/// `start(at:)` schedules the app to be relaunched (even from terminated) at
/// the target time; `extendedRuntimeSessionDidStart` then calls `notifyUser`,
/// which plays a repeating haptic plus a system alarm alert if the app isn't
/// frontmost. Where this channel can be scheduled (app must be `.active`)
/// and whether it fires after kills are exactly what the probe measures.
final class ExtendedRuntimeAlarmScheduler: NSObject, AlarmScheduler, WKExtendedRuntimeSessionDelegate {
    /// The app delegate forwards `handle(_:)` relaunches here so a session
    /// that outlived the process still gets its delegate attached.
    static let shared = ExtendedRuntimeAlarmScheduler()

    private var session: WKExtendedRuntimeSession?

    func schedule(atMs: EpochMs, kind: AlarmKind, sessionId: String) {
        let appState = WKApplication.shared().applicationState
        if appState == .active { session?.invalidate() }
        let s = WKExtendedRuntimeSession()
        s.delegate = self
        session = s
        s.start(at: Date(timeIntervalSince1970: TimeInterval(atMs) / 1000))
        ProbeLog.shared.log("ers_alarm_scheduled", [
            "kind": kind.rawValue,
            "atMs": atMs,
            "appState": appState.rawValue,
            "state": s.state.rawValue,
        ])
    }

    func cancelAll() {
        ProbeLog.shared.log("alarm_cancelled", [
            "channel": "ers",
            "state": session?.state.rawValue ?? -1,
        ])
        if WKApplication.shared().applicationState == .active {
            session?.invalidate()
        }
        session = nil
    }

    /// Called by the app delegate's `handle(_:)` when the system relaunches
    /// the app for a scheduled session.
    func attach(_ session: WKExtendedRuntimeSession) {
        self.session = session
        session.delegate = self
        ProbeLog.shared.log("ers_attached_on_launch", ProbeEnv.capture())
    }

    // MARK: WKExtendedRuntimeSessionDelegate

    func extendedRuntimeSessionDidStart(_ session: WKExtendedRuntimeSession) {
        ProbeLog.shared.log("ers_session_started", ProbeEnv.capture())
        // Repeating haptic until the user dismisses the system alarm alert —
        // the strongest wake signal watchOS offers a third-party app.
        session.notifyUser(hapticType: .notification) { _ in 2.0 }
        ProbeLog.shared.log("ers_haptic_started")
    }

    func extendedRuntimeSessionWillExpire(_ session: WKExtendedRuntimeSession) {
        ProbeLog.shared.log("ers_will_expire")
    }

    func extendedRuntimeSession(
        _ session: WKExtendedRuntimeSession,
        didInvalidateWith reason: WKExtendedRuntimeSessionInvalidationReason,
        error: Error?
    ) {
        ProbeLog.shared.log("ers_invalidated", [
            "reason": reason.rawValue,
            "error": error?.localizedDescription ?? "",
        ])
    }
}

/// Fans a scheduled wake out to every enabled channel. During the milestone
/// both the notification and the ERS alarm get scheduled; the log then shows
/// which actually reached the user and when.
final class CompositeAlarmScheduler: AlarmScheduler {
    private let schedulers: [AlarmScheduler]

    init(_ schedulers: [AlarmScheduler]) {
        self.schedulers = schedulers
    }

    func schedule(atMs: EpochMs, kind: AlarmKind, sessionId: String) {
        schedulers.forEach { $0.schedule(atMs: atMs, kind: kind, sessionId: sessionId) }
    }

    func cancelAll() {
        schedulers.forEach { $0.cancelAll() }
    }
}

// MARK: - Haptics

/// WakePattern steps map to semantic WKHapticTypes. Pulse durations become
/// real delays so the felt rhythm matches the shared pattern math.
final class WatchHaptics: HapticService {
    private var task: Task<Void, Never>?

    func playWake(_ pattern: WakePattern) {
        task?.cancel()
        ProbeLog.shared.log("haptic_start", [
            "steps": pattern.steps.count,
            "repeatIntervalMs": pattern.repeatIntervalMs,
        ])
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
        ProbeLog.shared.log("haptic_stop")
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

/// Anchored HR query + sample logging shared by both detector modes. Every
/// sample and every gap >10 s is logged — cadence and gaps are the raw data
/// behind "can the app know when the person falls asleep" and "how quickly".
final class HeartRateProbeStream {
    var onSample: ((EpochMs, Double) -> Void)?

    private let store: HKHealthStore
    private var query: HKAnchoredObjectQuery?
    private var lastAtMs: EpochMs?

    init(store: HKHealthStore) {
        self.store = store
    }

    func start() {
        let heartRate = HKQuantityType(.heartRate)
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
    }

    private func ingest(_ samples: [HKSample]?) {
        guard let quantities = samples as? [HKQuantitySample] else { return }
        for s in quantities {
            let atMs = Int64(s.startDate.timeIntervalSince1970 * 1000)
            let bpm = s.quantity.doubleValue(
                for: HKUnit.count().unitDivided(by: .minute())
            )
            if let last = lastAtMs, atMs - last > 10_000 {
                ProbeLog.shared.log("hr_gap", ["gapMs": atMs - last])
            }
            lastAtMs = atMs
            ProbeLog.shared.log("hr_sample", ["bpm": Int(bpm.rounded())])
            onSample?(atMs, bpm)
        }
    }
}

/// Heart rate is the primary onset signal: wrist motion on watchOS saturates
/// within minutes of stillness, so a workout session keeps HR streaming and
/// the SleepOnsetDetector applies the shared heuristic.
///
/// Honest limitation: this is a heuristic, not a polysomnograph. The UI copy
/// must never claim medical-grade detection (see docs/adr/0003).
final class HealthKitSleepDetector: NSObject, SleepDetectionService, HKWorkoutSessionDelegate {
    private let store = HKHealthStore()
    private var workout: HKWorkoutSession?
    private var stream: HeartRateProbeStream?
    private var detector = SleepOnsetDetector()
    private var listeners: [UUID: (EpochMs) -> Void] = [:]

    func start() async throws {
        guard HKHealthStore.isHealthDataAvailable() else {
            throw WatchServiceError.healthDataUnavailable
        }
        ProbeLog.shared.log("detector_start", ["mode": "workout"].merging(ProbeEnv.capture()) { _, n in n })
        let heartRate = HKQuantityType(.heartRate)
        try await store.requestAuthorization(
            toShare: [HKObjectType.workoutType()],
            read: [heartRate]
        )
        ProbeLog.shared.log("hr_auth", [
            "status": store.authorizationStatus(for: heartRate).rawValue,
        ])

        // The workout session keeps the app alive and HR streaming in the
        // background for the whole nap — required for real-time detection.
        let config = HKWorkoutConfiguration()
        config.activityType = .mindAndBody
        config.locationType = .indoor
        let session = try HKWorkoutSession(healthStore: store, configuration: config)
        session.delegate = self
        session.startActivity(with: Date())
        self.workout = session

        detector = SleepOnsetDetector()
        let stream = HeartRateProbeStream(store: store)
        stream.onSample = { [weak self] atMs, bpm in
            self?.feed(atMs: atMs, bpm: bpm)
        }
        stream.start()
        self.stream = stream
    }

    func stop() {
        ProbeLog.shared.log("detector_stop", ["mode": "workout"])
        stream?.stop()
        stream = nil
        workout?.end()
        workout = nil
        detector.reset()
        ProbeLog.shared.flush()
    }

    func onSleepDetected(_ callback: @escaping (EpochMs) -> Void) -> () -> Void {
        let id = UUID()
        listeners[id] = callback
        return { self.listeners[id] = nil }
    }

    private func feed(atMs: EpochMs, bpm: Double) {
        detector.feed(PhysioSample(atMs: atMs, heartRate: bpm))
        if let onset = detector.onsetAtMs {
            ProbeLog.shared.log("onset", [
                "atMs": onset,
                "mode": "workout",
            ])
            detector.reset()
            listeners.values.forEach { $0(onset) }
        }
    }

    // MARK: HKWorkoutSessionDelegate

    func workoutSession(
        _ workoutSession: HKWorkoutSession,
        didChangeTo toState: HKWorkoutSessionState,
        from fromState: HKWorkoutSessionState,
        date: Date
    ) {
        ProbeLog.shared.log("workout_state", [
            "from": fromState.rawValue,
            "to": toState.rawValue,
        ])
    }

    func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
        ProbeLog.shared.log("workout_error", ["error": error.localizedDescription])
    }

    func workoutSession(_ workoutSession: HKWorkoutSession, didGenerate event: HKWorkoutEvent) {
        ProbeLog.shared.log("workout_event", ["type": event.type.rawValue])
    }
}

/// Alternative keep-alive: no workout session — a smart-alarm extended
/// runtime session is started ~immediately and the same anchored HR query
/// runs while it provides background runtime (30-minute cap). Probe question:
/// does ERS alone keep HR flowing at usable cadence (lower battery than a
/// workout)? Gaps and the 30-min invalidation are logged like everything else.
final class ExtendedRuntimeSleepDetector: NSObject, SleepDetectionService, WKExtendedRuntimeSessionDelegate {
    private let store = HKHealthStore()
    private var ers: WKExtendedRuntimeSession?
    private var stream: HeartRateProbeStream?
    private var detector = SleepOnsetDetector()
    private var listeners: [UUID: (EpochMs) -> Void] = [:]

    func start() async throws {
        guard HKHealthStore.isHealthDataAvailable() else {
            throw WatchServiceError.healthDataUnavailable
        }
        ProbeLog.shared.log("detector_start", ["mode": "ers"].merging(ProbeEnv.capture()) { _, n in n })
        let heartRate = HKQuantityType(.heartRate)
        try await store.requestAuthorization(toShare: [], read: [heartRate])
        ProbeLog.shared.log("hr_auth", [
            "status": store.authorizationStatus(for: heartRate).rawValue,
        ])

        let s = WKExtendedRuntimeSession()
        s.delegate = self
        ers = s
        s.start(at: Date().addingTimeInterval(2))

        detector = SleepOnsetDetector()
        let stream = HeartRateProbeStream(store: store)
        stream.onSample = { [weak self] atMs, bpm in
            self?.feed(atMs: atMs, bpm: bpm)
        }
        stream.start()
        self.stream = stream
    }

    func stop() {
        ProbeLog.shared.log("detector_stop", ["mode": "ers"])
        stream?.stop()
        stream = nil
        if WKApplication.shared().applicationState == .active {
            ers?.invalidate()
        }
        ers = nil
        detector.reset()
        ProbeLog.shared.flush()
    }

    func onSleepDetected(_ callback: @escaping (EpochMs) -> Void) -> () -> Void {
        let id = UUID()
        listeners[id] = callback
        return { self.listeners[id] = nil }
    }

    private func feed(atMs: EpochMs, bpm: Double) {
        detector.feed(PhysioSample(atMs: atMs, heartRate: bpm))
        if let onset = detector.onsetAtMs {
            ProbeLog.shared.log("onset", [
                "atMs": onset,
                "mode": "ers",
            ])
            detector.reset()
            listeners.values.forEach { $0(onset) }
        }
    }

    // MARK: WKExtendedRuntimeSessionDelegate

    func extendedRuntimeSessionDidStart(_ extendedRuntimeSession: WKExtendedRuntimeSession) {
        ProbeLog.shared.log("ers_session_started",
            ["mode": "detector"].merging(ProbeEnv.capture()) { _, n in n })
    }

    func extendedRuntimeSessionWillExpire(_ extendedRuntimeSession: WKExtendedRuntimeSession) {
        ProbeLog.shared.log("ers_will_expire", ["mode": "detector"])
    }

    func extendedRuntimeSession(
        _ extendedRuntimeSession: WKExtendedRuntimeSession,
        didInvalidateWith reason: WKExtendedRuntimeSessionInvalidationReason,
        error: Error?
    ) {
        ProbeLog.shared.log("ers_invalidated", [
            "mode": "detector",
            "reason": reason.rawValue,
            "error": error?.localizedDescription ?? "",
        ])
    }
}
