import Foundation
import WatchKit
import SwiftUI

/// Hardware-validation probe. One JSON object per line — the exact same
/// schema as apps/wear `ProbeLog.kt`, consumed by `scripts/probe-report.mjs`:
///
///     {"t":1758820000000,"app":"watchos","v":1,"ev":"hr_sample",
///      "session":"nap-…","d":{…}}
///
/// Lines buffer in memory and flush in batches so logging itself does not
/// distort the battery measurements it exists to capture. The file lives in
/// the app container's Documents; pull it with Xcode ▸ Devices ▸ Download
/// Container (see docs/HARDWARE_VALIDATION.md).
final class ProbeLog {
    static let shared = ProbeLog()

    private let lock = NSLock()
    private var buffer: [String] = []
    private(set) var fileURL: URL?

    /// Set when a nap arms so every event can be grouped per nap session.
    var sessionId: String?

    private init() {
        // App container Documents — pulled off-device via Xcode ▸ Devices ▸
        // Download Container (group containers don't ride along).
        fileURL = FileManager.default
            .urls(for: .documentDirectory, in: .userDomainMask).first?
            .appendingPathComponent("probe.jsonl")
        if let url = fileURL,
           let size = try? FileManager.default
               .attributesOfItem(atPath: url.path)[.size] as? Int,
           size > 4_000_000 {
            try? FileManager.default.removeItem(at: url)
        }
    }

    func log(_ event: String, _ fields: [String: Any] = [:]) {
        var obj: [String: Any] = [
            "t": Int64(Date().timeIntervalSince1970 * 1000),
            "app": "watchos",
            "v": 1,
            "ev": event,
        ]
        if let sessionId { obj["session"] = sessionId }
        if !fields.isEmpty { obj["d"] = fields }
        guard let data = try? JSONSerialization.data(withJSONObject: obj),
              let line = String(data: data, encoding: .utf8) else { return }
        lock.lock()
        buffer.append(line)
        let count = buffer.count
        lock.unlock()
        if count >= 32 { flush() }
    }

    func flush() {
        lock.lock()
        let lines = buffer
        buffer.removeAll()
        lock.unlock()
        guard let url = fileURL, !lines.isEmpty else { return }
        let text = lines.joined(separator: "\n") + "\n"
        if !FileManager.default.fileExists(atPath: url.path) {
            FileManager.default.createFile(atPath: url.path, contents: Data(text.utf8))
            return
        }
        if let handle = try? FileHandle(forWritingTo: url) {
            handle.seekToEndOfFile()
            handle.write(Data(text.utf8))
            try? handle.close()
        }
    }

    func tail(_ n: Int = 80) -> [String] {
        flush()
        guard let url = fileURL,
              let text = try? String(contentsOf: url, encoding: .utf8) else { return [] }
        return Array(text.split(separator: "\n").map(String.init).suffix(n))
    }

    var fileSizeBytes: Int {
        flush()
        guard let url = fileURL else { return 0 }
        return (try? FileManager.default
            .attributesOfItem(atPath: url.path)[.size] as? Int) ?? 0
    }
}

/// Environment snapshot attached to milestone events (arm / detect / wake /
/// kill-restore). Anything that could explain a gap in the HR stream or a
/// missed alarm belongs here so the report can correlate.
enum ProbeEnv {
    static func capture() -> [String: Any] {
        let device = WKInterfaceDevice.current()
        device.isBatteryMonitoringEnabled = true
        var d: [String: Any] = [
            "appState": WKApplication.shared().applicationState.rawValue,
            "lowPower": ProcessInfo.processInfo.isLowPowerModeEnabled,
        ]
        if device.batteryLevel >= 0 {
            d["batteryPct"] = Int(round(device.batteryLevel * 100))
        }
        return d
    }
}

/// Probe toggles persisted in the app-group defaults. Read when the
/// SessionViewModel builds services — take effect on the next arm.
enum ProbeConfig {
    private static var defaults: UserDefaults {
        UserDefaults(suiteName: "group.app.siesta") ?? .standard
    }

    /// "workout" = HKWorkoutSession keep-alive (primary path).
    /// "ers" = WKExtendedRuntimeSession alarm type started ~now — tests
    /// whether an ERS alone keeps the app alive and HR streaming (E6).
    static var detectorMode: String {
        defaults.string(forKey: "probe.detectorMode") ?? "workout"
    }
    static func setDetectorMode(_ value: String) {
        defaults.set(value, forKey: "probe.detectorMode")
    }

    /// When true, every scheduled wake also schedules a smart-alarm extended
    /// runtime session in parallel with the local notification (E4/E8).
    static var ersAlarmEnabled: Bool {
        defaults.object(forKey: "probe.ersAlarm") as? Bool ?? true
    }
    static func setErsAlarm(_ value: Bool) {
        defaults.set(value, forKey: "probe.ersAlarm")
    }
}

#if DEBUG
/// Minimal on-watch probe console: config toggles, file stats, and a raw tail
/// of the event log for eyeballing without pulling the container.
struct ProbeDebugView: View {
    @State private var lines: [String] = []
    @State private var fileSize = 0
    @State private var detectorMode = ProbeConfig.detectorMode
    @State private var ersAlarm = ProbeConfig.ersAlarmEnabled

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 6) {
                Text("Probe").font(.headline)
                Picker("Detector", selection: $detectorMode) {
                    Text("workout").tag("workout")
                    Text("ers").tag("ers")
                }
                .labelsHidden()
                .frame(height: 40)
                .onChange(of: detectorMode) { ProbeConfig.setDetectorMode(detectorMode) }
                Toggle("ERS alarm", isOn: $ersAlarm)
                    .font(.footnote)
                    .onChange(of: ersAlarm) { ProbeConfig.setErsAlarm(ersAlarm) }
                Text("log \(fileSize / 1024) KB")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                ForEach(Array(lines.enumerated()), id: \.offset) { _, line in
                    Text(line)
                        .font(.system(size: 9, design: .monospaced))
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .padding(.horizontal, 6)
        }
        .onAppear {
            lines = ProbeLog.shared.tail()
            fileSize = ProbeLog.shared.fileSizeBytes
        }
    }
}
#endif
