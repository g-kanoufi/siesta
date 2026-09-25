import Foundation

/// Bridges the deterministic NapSessionManager to SwiftUI.
/// The manager is created via `resume` so a nap survives process death.
@MainActor
final class SessionViewModel: ObservableObject {
    @Published private(set) var view: NapViewState?
    @Published var selectedMinutes: Int = 20

    private var manager: NapSessionManager?
    private var unsubscribe: (() -> Void)?

    func start() async {
        guard manager == nil else { return }
        let m = await NapSessionManager.resume(
            clock: SystemClock(),
            sleep: HealthKitSleepDetector(),
            scheduler: NotificationAlarmScheduler(),
            haptics: WatchHaptics(),
            store: UserDefaultsSessionStore(),
            wakeIntensity: .normal
        )
        manager = m
        unsubscribe = m.subscribe { [weak self] _ in
            // Subscription fires synchronously from mutations; hop to MainActor.
            Task { @MainActor in self?.refresh() }
        }
        refresh()
    }

    private func refresh() {
        view = manager?.view()
    }

    /// Called by the 1 Hz TimelineView — deadlines are timestamp-derived,
    /// so this only re-reads the clock.
    func tick() {
        manager?.tick()
        refresh()
    }

    func selectDuration(_ minutes: Int) {
        selectedMinutes = minutes
        try? manager?.selectDuration(minutes)
    }

    func begin() {
        try? manager?.selectDuration(selectedMinutes)
        Task { try? await manager?.start() }
    }

    func beginManually() {
        try? manager?.selectDuration(selectedMinutes)
        try? manager?.startManually()
    }

    func cancel() {
        manager?.cancel()
        manager?.dismiss()
    }

    func acknowledgeWake() {
        manager?.acknowledgeWake()
        manager?.dismiss()
    }
}
