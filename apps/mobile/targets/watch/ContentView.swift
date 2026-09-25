import SwiftUI

struct ContentView: View {
    @ObservedObject var viewModel: SessionViewModel

    private static let presets = napDurationPresets

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { _ in
            content
                .onAppear { viewModel.tick() }
                .onChange(of: Date()) { viewModel.tick() }
        }
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

/// The geometric hammock mark — two posts, one dip. Motion follows the
/// shared design tokens (packages/design-tokens/src/motion.ts):
/// breathe 4.2s/1.8% while waiting, sway 6.2s/1.6° while sleeping,
/// a one-shot spring rise on wake, and a small dip on armed.
/// Everything disables under Reduce Motion.
struct HammockGlyph: View {
    let state: NapState

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var lift: CGFloat = 0

    var body: some View {
        ZStack(alignment: .bottom) {
            HStack {
                Capsule().frame(width: 2, height: 14)
                Spacer()
                Capsule().frame(width: 2, height: 14)
            }
            .frame(width: 74)
            .foregroundStyle(.secondary)

            ArcShape()
                .stroke(Color.accentColor, style: StrokeStyle(lineWidth: 2, lineCap: .round))
                .frame(width: 64, height: 18)
        }
        .frame(height: 30)
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
        .onChange(of: state) { updateLift(for: $0) }
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

private struct ArcShape: Shape {
    func path(in rect: CGRect) -> Path {
        var p = Path()
        p.move(to: CGPoint(x: rect.minX, y: rect.minY))
        p.addQuadCurve(
            to: CGPoint(x: rect.maxX, y: rect.minY),
            control: CGPoint(x: rect.midX, y: rect.maxY * 1.9)
        )
        return p
    }
}
