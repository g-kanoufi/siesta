import SwiftUI
import WatchKit

/// watchOS 11 app delegate — needed for two probe-critical paths:
/// 1. `handle(_:)` is called when a scheduled smart-alarm extended runtime
///    session relaunches the app (even after termination). The session is
///    forwarded to ExtendedRuntimeAlarmScheduler which attaches its delegate
///    and triggers the wake haptic.
/// 2. Lifecycle callbacks are logged so the probe can correlate HR gaps and
///    missed callbacks with app state transitions.
final class SiestaAppDelegate: NSObject, WKApplicationDelegate {
    func applicationDidFinishLaunching() {
        ProbeLog.shared.log("boot", ProbeEnv.capture())
        ProbeLog.shared.log("probe_config", [
            "detectorMode": ProbeConfig.detectorMode,
            "ersAlarm": ProbeConfig.ersAlarmEnabled,
        ])
    }

    func applicationDidBecomeActive() {
        ProbeLog.shared.log("lifecycle", ["event": "active"])
    }

    func applicationWillResignActive() {
        ProbeLog.shared.log("lifecycle", ["event": "resign_active"])
        ProbeLog.shared.flush()
    }

    func applicationDidEnterBackground() {
        ProbeLog.shared.log("lifecycle", ["event": "background"])
        ProbeLog.shared.flush()
    }

    func applicationWillEnterForeground() {
        ProbeLog.shared.log("lifecycle", ["event": "foreground"])
    }

    func handle(_ extendedRuntimeSession: WKExtendedRuntimeSession) {
        ExtendedRuntimeAlarmScheduler.shared.attach(extendedRuntimeSession)
    }
}

@main
struct SiestaWatchApp: App {
    @WKApplicationDelegateAdaptor(SiestaAppDelegate.self) private var appDelegate
    @StateObject private var viewModel = SessionViewModel()

    var body: some Scene {
        WindowGroup {
            ContentView(viewModel: viewModel)
                .task { await viewModel.start() }
        }
    }
}
