import Foundation

/// Bridges the deterministic NapSessionManager to SwiftUI.
/// The manager is created via `resume` so a nap survives process death.
/// Probe: services are chosen by ProbeConfig and every state transition is
/// logged with an environment snapshot — this file owns session-level events.
@MainActor
final class SessionViewModel: ObservableObject {
    @Published private(set) var view: NapViewState?
    @Published var selectedMinutes: Int = 20
    @Published var showProbe = false

    private static let durationKey = "siesta.defaultDurationMinutes"
    private static let appGroup = "group.app.siesta"
    private let wakeIntensity: WakeIntensity = .gentle

    private var manager: NapSessionManager?
    private var startRequestedFromComplication = false
    private var unsubscribe: (() -> Void)?
    private var lastLoggedState: NapState?
    private var sleepService: SleepDetectionService?

    func start() async {
        guard manager == nil else { return }
        let scheduler: AlarmScheduler = ProbeConfig.ersAlarmEnabled
            ? CompositeAlarmScheduler([
                NotificationAlarmScheduler(),
                ExtendedRuntimeAlarmScheduler.shared,
            ])
            : NotificationAlarmScheduler()
        let sleep: SleepDetectionService = ProbeConfig.detectorMode == "ers"
            ? ExtendedRuntimeSleepDetector()
            : HealthKitSleepDetector()
        sleepService = sleep
        let defaults = UserDefaults(suiteName: Self.appGroup)
        let storedDuration = defaults?.integer(forKey: Self.durationKey) ?? 20
        if napDurationPresets.contains(where: { $0.minutes == storedDuration }) {
            selectedMinutes = storedDuration
        }
        let m = await NapSessionManager.resume(
            clock: SystemClock(),
            sleep: sleep,
            scheduler: scheduler,
            haptics: WatchHaptics(),
            store: UserDefaultsSessionStore(),
            wakeIntensity: wakeIntensity
        )
        manager = m
        ProbeLog.shared.sessionId = m.snapshot?.id
        unsubscribe = m.subscribe { [weak self] _ in
            // Subscription fires synchronously from mutations; hop to MainActor.
            Task { @MainActor in self?.refresh() }
        }
        refresh()
        if startRequestedFromComplication {
            startRequestedFromComplication = false
            beginFromComplication()
        }
    }

    private func refresh() {
        view = manager?.view()
        logTransitionIfChanged()
    }

    private func logTransitionIfChanged() {
        guard let state = view?.state, state != lastLoggedState else { return }
        var d: [String: Any] = [
            "from": lastLoggedState?.rawValue ?? "none",
            "to": state.rawValue,
        ]
        d.merge(ProbeEnv.capture()) { _, new in new }
        ProbeLog.shared.log("session_state", d)
        lastLoggedState = state
        ProbeLog.shared.sessionId = manager?.snapshot?.id
        if state == .idle { ProbeLog.shared.flush() }
    }

    /// Deadlines are timestamp-derived, so this only re-reads the clock.
    func tick() {
        guard let manager else { return }
        manager.tick()
        refresh()
    }

    /// DEBUG-only: skips real detection and fires the onset listeners.
    /// Lets hardware experiments (wake, haptics, kill/recovery) run without
    /// the tester actually falling asleep.
    func simulateSleep() {
        (sleepService as? SimulatedSleepFiring)?
            .debugSimulateSleep(atMs: EpochMs(Date().timeIntervalSince1970 * 1000))
    }

    func selectDuration(_ minutes: Int) {
        selectedMinutes = minutes
        UserDefaults(suiteName: Self.appGroup)?.set(minutes, forKey: Self.durationKey)
        ProbeLog.shared.log("select", ["minutes": minutes])
        try? manager?.selectDuration(minutes)
    }

    func reloadDefaultDuration() {
        let storedDuration = UserDefaults(suiteName: Self.appGroup)?.integer(forKey: Self.durationKey) ?? 20
        guard napDurationPresets.contains(where: { $0.minutes == storedDuration }) else { return }
        if let manager {
            let state = manager.view().state
            guard state == .idle || state == .selectingDuration else { return }
            try? manager.selectDuration(storedDuration)
        }
        selectedMinutes = storedDuration
    }

    // First arm: explain why before the HealthKit sheet appears (§47).
    func begin() {
        arm()
    }

    func beginFromComplication() {
        guard let manager else {
            startRequestedFromComplication = true
            return
        }
        let state = manager.view().state
        guard state == .idle || state == .selectingDuration else {
            refresh()
            return
        }
        arm()
    }

    private func arm() {
        ProbeLog.shared.log("arm_begin", ["minutes": selectedMinutes])
        try? manager?.selectDuration(selectedMinutes)
        Task { try? await manager?.start() }
    }

    func beginManually() {
        ProbeLog.shared.log("arm_begin", ["minutes": selectedMinutes, "manual": true])
        try? manager?.selectDuration(selectedMinutes)
        try? manager?.startManually()
    }

    func cancel() {
        manager?.cancel()
        manager?.dismiss()
    }

    func acknowledgeWake() {
        ProbeLog.shared.log("wake_ack")
        manager?.acknowledgeWake()
        manager?.dismiss()
    }
}
