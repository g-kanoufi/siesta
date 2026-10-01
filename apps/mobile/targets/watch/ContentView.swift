import SwiftUI

/// Dusk palette — ports of packages/design-tokens/src/colors.ts (dark +
/// sunset). Flat hexes, same numbers as the Kotlin/TS tokens.
private extension Color {
    static let siestaAccent = Color(red: 0.839, green: 0.608, blue: 0.431) // #D69B6E
    static let siestaOnAccent = Color(red: 0.176, green: 0.137, blue: 0.114)
    static let siestaCream = Color(red: 0.949, green: 0.933, blue: 0.902) // #F2EEE6
    static let siestaSurface = Color(red: 0.169, green: 0.188, blue: 0.212)
    static let siestaSurfaceElevated = Color(red: 0.227, green: 0.251, blue: 0.275)
    static let siestaAccentSoft = Color(red: 0.286, green: 0.239, blue: 0.212)
    static let siestaScrim = Color(red: 0.106, green: 0.122, blue: 0.141)
    static let siestaLogoDawn = Color(red: 0.957, green: 0.773, blue: 0.424)
    static let siestaLogoEmber = Color(red: 0.910, green: 0.529, blue: 0.345)
    static let siestaLogoDusk = Color(red: 0.408, green: 0.498, blue: 0.604)
    static let siestaFabricNavy = Color(red: 0.125, green: 0.196, blue: 0.306)
    static let siestaFabricShadow = Color(red: 0.063, green: 0.118, blue: 0.212)
}

private struct WatchFaceBackground: View {
    var body: some View {
        ZStack {
            RadialGradient(
                stops: [
                    .init(color: .siestaSurfaceElevated, location: 0),
                    .init(color: .siestaSurface, location: 0.46),
                    .init(color: .siestaFabricNavy, location: 0.78),
                    .init(color: .siestaScrim, location: 1),
                ],
                center: .top,
                startRadius: 0,
                endRadius: 260
            )
            RadialGradient(
                colors: [.siestaAccentSoft.opacity(0.24), .clear],
                center: .bottom,
                startRadius: 0,
                endRadius: 170
            )
        }
    }
}

struct ContentView: View {
    @ObservedObject var viewModel: SessionViewModel
    @Environment(\.scenePhase) private var scenePhase

    private static let presets = napDurationPresets

    var body: some View {
        content
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(WatchFaceBackground().ignoresSafeArea())
            .tint(.siestaAccent)
            .preferredColorScheme(.dark)
            .onOpenURL { url in
                if url.scheme == "siesta", url.host == "start" {
                    viewModel.beginFromComplication()
                }
            }
            .onChange(of: scenePhase) { _, phase in
                if phase == .active { viewModel.reloadDefaultDuration() }
            }
            .task {
                while !Task.isCancelled {
                    viewModel.tick()
                    try? await Task.sleep(nanoseconds: 1_000_000_000)
                }
            }
    }

    @ViewBuilder
    private var content: some View {
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
            selectionView
        case .error:
            selectionView
        }
    }

    private var selectionView: some View {
        VStack(spacing: 3) {
            HammockGlyph(state: .idle, size: 46)

            if viewModel.view?.state == .error {
                Text("Couldn't access sleep data. Start a plain timer instead.")
                    .font(.caption2)
                    .multilineTextAlignment(.center)
                Button("Start without detection") { viewModel.beginManually() }
                    .buttonStyle(.borderedProminent)
                    .foregroundStyle(Color.siestaOnAccent)
                    .frame(maxWidth: 150)
            } else {
                Button("Start siesta") { viewModel.begin() }
                    .buttonStyle(.borderedProminent)
                    .foregroundStyle(Color.siestaOnAccent)
                    .frame(maxWidth: 150)
            }

            selectedDurationReadout
            if viewModel.view?.state != .error {
                Text("Starts when you drift off")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            durationSelector

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
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.horizontal, 4)
    }

    private var selectedDurationReadout: some View {
        HStack(alignment: .firstTextBaseline, spacing: 3) {
            Text("\(viewModel.selectedMinutes)")
                .font(.system(size: 36, weight: .semibold, design: .rounded))
                .monospacedDigit()
            Text("min")
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(.secondary)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Duration")
        .accessibilityValue("\(viewModel.selectedMinutes) minutes")
    }

    private var visiblePresets: [NapDurationPreset] {
        let index = Self.presets.firstIndex { $0.minutes == viewModel.selectedMinutes } ?? 2
        let start = max(0, min(index - 1, Self.presets.count - 3))
        return Array(Self.presets[start..<(start + 3)])
    }

    private var durationSelector: some View {
        HStack(spacing: 8) {
            ForEach(visiblePresets, id: \.minutes) { preset in
                Button { viewModel.selectDuration(preset.minutes) } label: {
                    Text("\(preset.minutes)")
                        .font(.system(
                            size: 14,
                            weight: preset.minutes == viewModel.selectedMinutes ? .semibold : .medium,
                            design: .rounded
                        ))
                        .foregroundStyle(
                            preset.minutes == viewModel.selectedMinutes
                                ? Color.siestaAccent
                                : Color.siestaCream.opacity(0.62)
                        )
                        .frame(width: 40, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("\(preset.minutes) minutes")
            }
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
        VStack(spacing: 4) {
            HammockGlyph(state: viewModel.view?.state ?? .idle, size: 46)
            if let detailAccessibility {
                Text(remainingClock)
                    .font(.system(size: 34, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .accessibilityLabel(detailAccessibility)
            } else {
                selectedDurationReadout
            }
            Text(title)
                .font(.footnote)
                .foregroundStyle(.secondary)
            if detailAccessibility == nil && !detail.isEmpty {
                Text(detail)
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .accessibilityLabel(detail)
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
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.horizontal, 6)
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
        VStack(spacing: 6) {
            HammockGlyph(state: viewModel.view?.state ?? .idle, size: 46)
            Text("Welcome back.")
                .font(.system(size: 20, weight: .regular, design: .serif))
            Button(primaryLabel, action: primaryAction)
                .buttonStyle(.borderedProminent)
                .foregroundStyle(Color.siestaOnAccent)
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

    private var remainingClock: String {
        guard let ms = viewModel.view?.remainingMs else { return "" }
        let total = Int(ceil(Double(ms) / 1000))
        return String(format: "%d:%02d", total / 60, total % 60)
    }

    private var remainingDetail: String {
        remainingClock.isEmpty ? "" : "\(remainingClock) remaining"
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
    let size: CGFloat

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var lift: CGFloat = 0

    init(state: NapState, size: CGFloat = 46) {
        self.state = state
        self.size = size
    }

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: size * 0.27, style: .continuous)
                .fill(LinearGradient(
                    colors: [.siestaLogoDawn, .siestaLogoEmber, .siestaLogoDusk],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ))
            LensShape()
                .fill(LinearGradient(
                    colors: [.siestaFabricNavy, .siestaFabricShadow],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ))
                .frame(width: size * 0.76, height: size * 0.40)
            HemShape()
                .fill(LinearGradient(
                    colors: [.siestaFabricNavy.opacity(0.78), .siestaFabricShadow],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ))
                .frame(width: size * 0.76, height: size * 0.40)
            HemShape()
                .stroke(Color.siestaFabricShadow.opacity(0.72), lineWidth: 1)
                .frame(width: size * 0.76, height: size * 0.40)
        }
        .frame(width: size, height: size)
        .overlay(
            RoundedRectangle(cornerRadius: size * 0.27, style: .continuous)
                .stroke(Color.siestaCream.opacity(0.12), lineWidth: 0.7)
        )
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
        let scale = min(rect.width / 800, rect.height / 418)
        let left = rect.minX + (rect.width - 800 * scale) / 2
        let top = rect.minY + (rect.height - 418 * scale) / 2
        func point(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
            CGPoint(x: left + (x - 112) * scale, y: top + (y - 342) * scale)
        }

        var p = Path()
        p.move(to: point(112, 342))
        p.addCurve(to: point(245, 480), control1: point(170, 342), control2: point(205, 420))
        p.addCurve(to: point(512, 610), control1: point(315, 575), control2: point(400, 610))
        p.addCurve(to: point(779, 480), control1: point(624, 610), control2: point(709, 575))
        p.addCurve(to: point(912, 342), control1: point(819, 420), control2: point(854, 342))
        p.addLine(to: point(912, 430))
        p.addCurve(to: point(780, 560), control1: point(854, 430), control2: point(819, 500))
        p.addCurve(to: point(512, 760), control1: point(710, 660), control2: point(625, 760))
        p.addCurve(to: point(244, 560), control1: point(399, 760), control2: point(314, 660))
        p.addCurve(to: point(112, 430), control1: point(203, 500), control2: point(168, 430))
        p.closeSubpath()
        return p
    }
}

private struct HemShape: Shape {
    func path(in rect: CGRect) -> Path {
        let scale = min(rect.width / 800, rect.height / 418)
        let left = rect.minX + (rect.width - 800 * scale) / 2
        let top = rect.minY + (rect.height - 418 * scale) / 2
        func point(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
            CGPoint(x: left + (x - 112) * scale, y: top + (y - 342) * scale)
        }

        var p = Path()
        p.move(to: point(112, 342))
        p.addCurve(to: point(245, 480), control1: point(170, 342), control2: point(205, 420))
        p.addCurve(to: point(512, 610), control1: point(315, 575), control2: point(400, 610))
        p.addCurve(to: point(779, 480), control1: point(624, 610), control2: point(709, 575))
        p.addCurve(to: point(912, 342), control1: point(819, 420), control2: point(854, 342))
        p.addLine(to: point(912, 390))
        p.addCurve(to: point(780, 510), control1: point(854, 390), control2: point(819, 448))
        p.addCurve(to: point(512, 645), control1: point(710, 586), control2: point(625, 645))
        p.addCurve(to: point(244, 510), control1: point(399, 645), control2: point(314, 586))
        p.addCurve(to: point(112, 390), control1: point(203, 448), control2: point(168, 390))
        p.closeSubpath()
        return p
    }
}
