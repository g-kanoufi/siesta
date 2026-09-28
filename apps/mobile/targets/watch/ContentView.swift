import SwiftUI

/// Dusk palette — ports of packages/design-tokens/src/colors.ts (dark +
/// sunset). Flat hexes, same numbers as the Kotlin/TS tokens.
private extension Color {
    static let siestaAccent = Color(red: 0.961, green: 0.639, blue: 0.431) // #F5A36E
    static let siestaCream = Color(red: 0.984, green: 0.949, blue: 0.894)  // #FBF2E4
    static let siestaZenith = Color(red: 0.180, green: 0.122, blue: 0.243) // #2E1F3E
    static let siestaScrim = Color(red: 0.075, green: 0.055, blue: 0.102)  // #130E1A
    static let siestaReflection = Color(red: 1, green: 0.702, blue: 0.365) // #FFB35D
}

/// The watch's own dusk sky — zenith plum at the crown, fading to near-black
/// at the bottom edge. Subtle; OLED-friendly.
private let duskSky = LinearGradient(
    colors: [.siestaZenith, .siestaScrim],
    startPoint: .top,
    endPoint: .bottom
)

struct ContentView: View {
    @ObservedObject var viewModel: SessionViewModel

    private static let presets = napDurationPresets

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { _ in
            content
                .onAppear { viewModel.tick() }
                .onChange(of: Date()) { viewModel.tick() }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(duskSky.ignoresSafeArea())
        .tint(.siestaAccent)
    }

    @ViewBuilder
    private var content: some View {
        if !viewModel.didOnboard {
            OnboardingView { viewModel.completeOnboarding() }
        } else if viewModel.showSleepAccessPrompt {
            SleepAccessView { viewModel.confirmSleepAccess() }
        } else {
        switch viewModel.view?.state ?? .idle {
        case .idle, .selectingDuration:
            selectionView
        case .armed, .waitingForSleep:
            statusView(
                title: "Waiting for sleep…",
                detail: failSafeDetail,
                primaryLabel: "Cancel",
                primaryAction: viewModel.cancel,
                debugAction: viewModel.simulateSleep
            )
        case .sleeping:
            statusView(
                title: "Sleeping",
                detail: remainingDetail,
                detailAccessibility: remainingAccessibility,
                primaryLabel: "Cancel",
                primaryAction: viewModel.cancel
            )
        case .waking:
            wakingView(primaryLabel: "I'm awake") {
                viewModel.acknowledgeWake()
            }
        case .completed:
            wakingView(primaryLabel: "Done") {
                viewModel.acknowledgeWake()
            }
        case .cancelled:
            statusView(
                title: "Cancelled",
                detail: "",
                primaryLabel: "Done",
                primaryAction: { viewModel.cancel() }
            )
        case .error:
            VStack(spacing: 8) {
                HammockGlyph(state: .idle)
                Text("Couldn't access sleep data.")
                    .font(.footnote)
                    .multilineTextAlignment(.center)
                Button("Start without detection") { viewModel.beginManually() }
                Button("Try again") { viewModel.cancel() }
                    .foregroundStyle(.secondary)
            }
        }
        }
    }

    private var selectionView: some View {
        VStack(spacing: 6) {
            HammockGlyph(state: viewModel.view?.state ?? .idle)

            Text("\(viewModel.selectedMinutes)")
                .font(.system(size: 44, weight: .semibold, design: .rounded))
                .monospacedDigit()
            + Text(" min")
                .font(.title3)
                .foregroundStyle(.secondary)
                .accessibilityLabel("\(viewModel.selectedMinutes) minutes")

            Text(Self.presets.first { $0.minutes == viewModel.selectedMinutes }?.description
                 ?? "Your nap")
                .font(.footnote)
                .foregroundStyle(.secondary)

            Picker("Duration", selection: Binding(
                get: { viewModel.selectedMinutes },
                set: { viewModel.selectDuration($0) }
            )) {
                ForEach(Self.presets, id: \.minutes) { preset in
                    Text("\(preset.minutes)").tag(preset.minutes)
                }
            }
            .pickerStyle(.wheel)
            .frame(height: 44)
            .labelsHidden()
            .accessibilityLabel("Nap duration in minutes")

            Button("Start siesta") { viewModel.begin() }
                .buttonStyle(.borderedProminent)

            Button("Wake: \(viewModel.wakeIntensity.rawValue.capitalized)") {
                viewModel.cycleWakeIntensity()
            }
            .font(.footnote)
            .foregroundStyle(.secondary)
            .buttonStyle(.plain)

            #if DEBUG
            Button("probe") { viewModel.showProbe = true }
                .font(.footnote)
                .foregroundStyle(.tertiary)
                .buttonStyle(.plain)
                .sheet(isPresented: $viewModel.showProbe) {
                    ProbeDebugView()
                }
            #endif
        }
        .padding(.horizontal, 4)
    }

    private func statusView(
        title: String,
        detail: String,
        detailAccessibility: String? = nil,
        primaryLabel: String,
        primaryAction: @escaping () -> Void,
        debugAction: (() -> Void)? = nil
    ) -> some View {
        VStack(spacing: 8) {
            HammockGlyph(state: viewModel.view?.state ?? .idle)
            Text(title)
                .font(.headline)
            if !detail.isEmpty {
                Text(detail)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .accessibilityLabel(detailAccessibility ?? detail)
            }
            if primaryLabel == "Cancel" {
                Button(primaryLabel, action: primaryAction)
                    .foregroundStyle(.secondary)
            } else {
                Button(primaryLabel, action: primaryAction)
                    .buttonStyle(.borderedProminent)
            }
            #if DEBUG
            if let debugAction {
                Button("Simulate sleep", action: debugAction)
                    .font(.footnote)
                    .foregroundStyle(.tertiary)
                    .buttonStyle(.plain)
            }
            #endif
        }
        .padding(.horizontal, 4)
    }

    /// The wake moment (§14): the screen arrives soft, the hammock rises and
    /// settles, then the copy brightens in. Under Reduce Motion it all
    /// appears at once — motion never carries meaning alone.
    @State private var wakeAppeared = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private func wakingView(
        primaryLabel: String,
        primaryAction: @escaping () -> Void
    ) -> some View {
        VStack(spacing: 8) {
            HammockGlyph(state: viewModel.view?.state ?? .idle)
            Text("Welcome back.")
                .font(.headline)
            Button(primaryLabel, action: primaryAction)
                .buttonStyle(.borderedProminent)
        }
        .padding(.horizontal, 4)
        .opacity(wakeAppeared ? 1 : 0)
        .onAppear {
            wakeAppeared = false
            if reduceMotion {
                wakeAppeared = true
            } else {
                withAnimation(.easeOut(duration: 0.35)) { wakeAppeared = true }
            }
        }
        .accessibilityElement(children: .contain)
    }

    private var remainingDetail: String {
        guard let ms = viewModel.view?.remainingMs else { return "" }
        let total = Int(ceil(Double(ms) / 1000))
        return String(format: "%d:%02d remaining", total / 60, total % 60)
    }

    /// "17:42 remaining" reads as "seventeen colon forty-two" in VoiceOver —
    /// announce it in words instead (§28).
    private var remainingAccessibility: String {
        guard let ms = viewModel.view?.remainingMs else { return "" }
        let total = Int(ceil(Double(ms) / 1000))
        let m = total / 60
        let s = total % 60
        if s == 0 { return "\(m) minutes remaining" }
        return "\(m) minutes, \(s) seconds remaining"
    }

    private var failSafeDetail: String {
        guard let ms = viewModel.view?.nextDeadlineMs else { return "" }
        let date = Date(timeIntervalSince1970: TimeInterval(ms) / 1000)
        return "We'll wake you by \(date.formatted(date: .omitted, time: .shortened)) at the latest."
    }
}

/// The geometric hammock mark — one broad, clean lens of cloth. Same
/// language as the app icon; no trunk, ropes or sun. Motion follows the
/// shared design tokens (packages/design-tokens/src/motion.ts):
/// breathe 4.2s/1.8% while waiting, sway 6.2s/1.6° while sleeping, a
/// one-shot spring rise on wake, and a small dip on armed.
/// Everything disables under Reduce Motion.
struct HammockGlyph: View {
    let state: NapState

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var lift: CGFloat = 0

    var body: some View {
        ZStack {
            ReflectionShape()
                .fill(Color.siestaReflection.opacity(0.78))
            LensShape()
                .fill(Color.siestaCream)
        }
        .frame(width: 70, height: 32)
        .offset(y: lift)
        .scaleEffect(state == .waitingForSleep || state == .armed ? 1.018 : 1)
        .rotationEffect(.degrees(state == .sleeping ? 1.6 : 0), anchor: .center)
        .animation(
            reduceMotion ? nil :
                state == .sleeping
                    ? .easeInOut(duration: 3.1).repeatForever(autoreverses: true)
                    : state == .waitingForSleep || state == .armed
                        ? .easeInOut(duration: 2.1).repeatForever(autoreverses: true)
                        : .default,
            value: state
        )
        .accessibilityHidden(true)
        .onAppear { updateLift(for: state) }
        .onChange(of: state) { _, newState in updateLift(for: newState) }
    }

    /// Waking/completed: the hammock starts low and springs up to rest.
    private func updateLift(for newState: NapState) {
        guard !reduceMotion else { lift = 0; return }
        if newState == .waking || newState == .completed {
            lift = 10
            withAnimation(.spring(response: 0.6, dampingFraction: 0.63)) { lift = 0 }
        } else {
            lift = 0
        }
    }
}

/// Filled hammock cloth: a lens — deep back edge, shallower front lip.
private struct LensShape: Shape {
    func path(in rect: CGRect) -> Path {
        let scale = min(rect.width / 1024, rect.height / 462)
        let left = rect.minX + (rect.width - 1024 * scale) / 2
        let top = rect.minY + (rect.height - 462 * scale) / 2
        func point(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
            CGPoint(x: left + x * scale, y: top + (y - 382) * scale)
        }

        var p = Path()
        p.move(to: point(0, 382))
        p.addLine(to: point(82, 449))
        p.addCurve(to: point(512, 610), control1: point(210, 548), control2: point(350, 610))
        p.addCurve(to: point(942, 449), control1: point(674, 610), control2: point(814, 548))
        p.addLine(to: point(1024, 382))
        p.addLine(to: point(1024, 414))
        p.addLine(to: point(948, 476))
        p.addCurve(to: point(512, 650), control1: point(821, 582), control2: point(680, 650))
        p.addCurve(to: point(76, 476), control1: point(344, 650), control2: point(203, 582))
        p.addLine(to: point(0, 414))
        p.closeSubpath()
        p.addEllipse(in: CGRect(x: point(64, 431).x, y: point(64, 431).y, width: 36 * scale, height: 36 * scale))
        p.addEllipse(in: CGRect(x: point(924, 431).x, y: point(924, 431).y, width: 36 * scale, height: 36 * scale))
        return p
    }
}

private struct ReflectionShape: Shape {
    func path(in rect: CGRect) -> Path {
        let scale = min(rect.width / 1024, rect.height / 462)
        let left = rect.minX + (rect.width - 1024 * scale) / 2
        let top = rect.minY + (rect.height - 462 * scale) / 2
        var p = Path()
        for (centerY, radiusX, radiusY) in [(CGFloat(715), CGFloat(155), CGFloat(13)), (760, 105, 10), (801, 62, 8), (838, 30, 6)] {
            p.addEllipse(in: CGRect(
                x: left + (512 - radiusX) * scale,
                y: top + (centerY - radiusY - 382) * scale,
                width: radiusX * 2 * scale,
                height: radiusY * 2 * scale
            ))
        }
        return p
    }
}
