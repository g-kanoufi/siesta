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
        switch viewModel.view?.state ?? .idle {
        case .idle, .selectingDuration:
            selectionView
        case .armed, .waitingForSleep:
            statusView(
                title: "Waiting for sleep…",
                detail: failSafeDetail,
                primaryLabel: "Cancel",
                primaryAction: viewModel.cancel
            )
        case .sleeping:
            statusView(
                title: "Sleeping",
                detail: remainingDetail,
                primaryLabel: "Cancel",
                primaryAction: viewModel.cancel
            )
        case .waking:
            statusView(
                title: "Welcome back.",
                detail: "",
                primaryLabel: "I'm awake",
                primaryAction: viewModel.acknowledgeWake
            )
        case .completed:
            statusView(
                title: "Welcome back.",
                detail: "",
                primaryLabel: "Done",
                primaryAction: { viewModel.acknowledgeWake() }
            )
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

    private var selectionView: some View {
        VStack(spacing: 6) {
            HammockGlyph(state: viewModel.view?.state ?? .idle)

            Text("\(viewModel.selectedMinutes)")
                .font(.system(size: 44, weight: .semibold, design: .rounded))
                .monospacedDigit()
            + Text(" min")
                .font(.title3)
                .foregroundStyle(.secondary)

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
        primaryLabel: String,
        primaryAction: @escaping () -> Void
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
            }
            if primaryLabel == "Cancel" {
                Button(primaryLabel, action: primaryAction)
                    .foregroundStyle(.secondary)
            } else {
                Button(primaryLabel, action: primaryAction)
                    .buttonStyle(.borderedProminent)
            }
        }
        .padding(.horizontal, 4)
    }

    private var remainingDetail: String {
        guard let ms = viewModel.view?.remainingMs else { return "" }
        let total = Int(ceil(Double(ms) / 1000))
        return String(format: "%d:%02d remaining", total / 60, total % 60)
    }

    private var failSafeDetail: String {
        guard let ms = viewModel.view?.nextDeadlineMs else { return "" }
        let date = Date(timeIntervalSince1970: TimeInterval(ms) / 1000)
        return "We'll wake you by \(date.formatted(date: .omitted, time: .shortened)) at the latest."
    }
}

/// The geometric hammock mark — two posts, one dip. Deliberately minimal:
/// the watch face is small and the mark must read at a glance.
struct HammockGlyph: View {
    let state: NapState

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
        .rotationEffect(.degrees(state == .sleeping ? 1.5 : 0), anchor: .center)
        .animation(
            state == .sleeping
                ? .easeInOut(duration: 2.4).repeatForever(autoreverses: true)
                : .default,
            value: state
        )
        .accessibilityHidden(true)
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
