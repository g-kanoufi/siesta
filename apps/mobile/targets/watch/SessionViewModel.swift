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
    @Published var wakeIntensity: WakeIntensity = .gentle
    @Published var didOnboard = false
    @Published var showSleepAccessPrompt = false

    private static let intensityKey = "siesta.wakeIntensity"
    private static let onboardKey = "siesta.didOnboard"
    private static let sleepAccessKey = "siesta.didExplainSleepAccess"

    private var manager: NapSessionManager?
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
        wakeIntensity = UserDefaults.standard
            .string(forKey: Self.intensityKey)
            .flatMap(WakeIntensity.init(rawValue:)) ?? .gentle
        didOnboard = UserDefaults.standard.bool(forKey: Self.onboardKey)
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

    /// Gentle → Normal → Strong. Persisted; takes effect immediately by
    /// rebuilding the manager — only callable while no nap is in flight.
    func cycleWakeIntensity() {
        let all = WakeIntensity.allCases
        let i = (all.firstIndex(of: wakeIntensity) ?? 0) + 1
        let next = all[i % all.count]
        wakeIntensity = next
        UserDefaults.standard.set(next.rawValue, forKey: Self.intensityKey)
        ProbeLog.shared.log("wake_intensity", ["value": next.rawValue])
        Task { await rebuild() }
    }

    private func rebuild() async {
        unsubscribe?()
        unsubscribe = nil
        manager = nil
        await start()
    }

    func selectDuration(_ minutes: Int) {
        selectedMinutes = minutes
        ProbeLog.shared.log("select", ["minutes": minutes])
        try? manager?.selectDuration(minutes)
    }

    func completeOnboarding() {
        didOnboard = true
        UserDefaults.standard.set(true, forKey: Self.onboardKey)
    }

    func begin() {
        // First arm: explain why before the HealthKit sheet appears (§47).
        if !UserDefaults.standard.bool(forKey: Self.sleepAccessKey) {
            showSleepAccessPrompt = true
            return
        }
        arm()
    }

    func confirmSleepAccess() {
        UserDefaults.standard.set(true, forKey: Self.sleepAccessKey)
        showSleepAccessPrompt = false
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
