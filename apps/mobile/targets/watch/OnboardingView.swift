import SwiftUI

/// First-run intro per the brief: three short screens, under ~20 seconds,
/// no carousel chrome — just Continue. Shown once (siesta.didOnboard).
struct OnboardingView: View {
    let onDone: () -> Void
    @State private var page = 0

    private static let pages: [(title: String, body: String)] = [
        ("Meet Siesta.", "A tiny nap timer that waits for you to fall asleep."),
        ("Pick your nap.", "Choose how long you'd like to sleep."),
        ("We'll wake you gently.", "Siesta uses your watch's haptics when your nap is over."),
    ]

    var body: some View {
        let p = Self.pages[page]
        VStack(spacing: 10) {
            HammockGlyph(state: .idle)
            Text(p.title)
                .font(.headline)
            Text(p.body)
                .font(.footnote)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Button(page == Self.pages.count - 1 ? "Continue" : "Next") {
                if page == Self.pages.count - 1 { onDone() } else { page += 1 }
            }
            .buttonStyle(.borderedProminent)
        }
        .padding(.horizontal, 8)
    }
}

/// One-time contextual explainer shown immediately before the first arm —
/// the HealthKit permission sheet fires right after this, so the user knows
/// why (brief §47: request at the moment of use, never without context).
struct SleepAccessView: View {
    let onAllow: () -> Void

    var body: some View {
        VStack(spacing: 10) {
            HammockGlyph(state: .idle)
            Text("To know when you've fallen asleep, Siesta reads your heart rate.")
                .font(.footnote)
                .multilineTextAlignment(.center)
            Button("Allow sleep access", action: onAllow)
                .buttonStyle(.borderedProminent)
        }
        .padding(.horizontal, 8)
    }
}
