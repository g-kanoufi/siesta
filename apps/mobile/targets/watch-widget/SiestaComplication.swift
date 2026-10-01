import SwiftUI
import WidgetKit

private struct SiestaEntry: TimelineEntry {
    let date: Date
}

private struct SiestaProvider: TimelineProvider {
    func placeholder(in context: Context) -> SiestaEntry {
        SiestaEntry(date: .now)
    }

    func getSnapshot(in context: Context, completion: @escaping (SiestaEntry) -> Void) {
        completion(SiestaEntry(date: .now))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<SiestaEntry>) -> Void) {
        completion(Timeline(entries: [SiestaEntry(date: .now)], policy: .never))
    }
}

private struct HammockShape: Shape {
    func path(in rect: CGRect) -> Path {
        func point(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
            CGPoint(
                x: rect.minX + (x - 112) / 800 * rect.width,
                y: rect.minY + (y - 342) / 418 * rect.height
            )
        }

        var path = Path()
        path.move(to: point(112, 342))
        path.addCurve(to: point(245, 480), control1: point(170, 342), control2: point(205, 420))
        path.addCurve(to: point(512, 610), control1: point(315, 575), control2: point(400, 610))
        path.addCurve(to: point(779, 480), control1: point(624, 610), control2: point(709, 575))
        path.addCurve(to: point(912, 342), control1: point(819, 420), control2: point(854, 342))
        path.addLine(to: point(912, 430))
        path.addCurve(to: point(780, 560), control1: point(854, 430), control2: point(819, 500))
        path.addCurve(to: point(512, 760), control1: point(710, 660), control2: point(625, 760))
        path.addCurve(to: point(244, 560), control1: point(399, 760), control2: point(314, 660))
        path.addCurve(to: point(112, 430), control1: point(203, 500), control2: point(168, 430))
        path.closeSubpath()
        return path
    }
}

private struct HammockHemShape: Shape {
    func path(in rect: CGRect) -> Path {
        func point(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
            CGPoint(
                x: rect.minX + (x - 112) / 800 * rect.width,
                y: rect.minY + (y - 342) / 418 * rect.height
            )
        }

        var path = Path()
        path.move(to: point(112, 342))
        path.addCurve(to: point(245, 480), control1: point(170, 342), control2: point(205, 420))
        path.addCurve(to: point(512, 610), control1: point(315, 575), control2: point(400, 610))
        path.addCurve(to: point(779, 480), control1: point(624, 610), control2: point(709, 575))
        path.addCurve(to: point(912, 342), control1: point(819, 420), control2: point(854, 342))
        path.addLine(to: point(912, 390))
        path.addCurve(to: point(780, 510), control1: point(854, 390), control2: point(819, 448))
        path.addCurve(to: point(512, 645), control1: point(710, 586), control2: point(625, 645))
        path.addCurve(to: point(244, 510), control1: point(399, 645), control2: point(314, 586))
        path.addCurve(to: point(112, 390), control1: point(203, 448), control2: point(168, 390))
        path.closeSubpath()
        return path
    }
}

private struct HammockMark: View {
    var body: some View {
        ZStack {
            HammockShape()
                .fill(LinearGradient(
                    colors: [Color(red: 0.125, green: 0.196, blue: 0.306), Color(red: 0.063, green: 0.118, blue: 0.212)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ))
            HammockHemShape()
                .fill(LinearGradient(
                    colors: [Color(red: 0.125, green: 0.196, blue: 0.306).opacity(0.78), Color(red: 0.063, green: 0.118, blue: 0.212)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ))
            HammockHemShape()
                .stroke(Color(red: 0.063, green: 0.118, blue: 0.212).opacity(0.82), lineWidth: 1.1)
        }
        .accessibilityHidden(true)
    }
}

private struct SiestaEntryView: View {
    @Environment(\.widgetFamily) private var family

    var body: some View {
        Group {
            switch family {
            case .accessoryInline:
                HStack(spacing: 4) {
                    HammockMark()
                        .frame(width: 16, height: 9)
                    Text("Start Siesta")
                }
            case .accessoryRectangular:
                HStack(spacing: 8) {
                    HammockMark()
                        .frame(width: 32, height: 14)
                    VStack(alignment: .leading, spacing: 3) {
                        Text("Siesta")
                        Text("Tap to start")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
            case .accessoryCorner:
                HammockMark()
                    .frame(width: 18, height: 11)
                    .widgetLabel { Text("Siesta") }
            default:
                HammockMark()
                    .frame(width: 20, height: 12)
            }
        }
        .widgetURL(URL(string: "siesta://start"))
        .tint(Color(red: 0.941, green: 0.627, blue: 0.502))
    }
}

private struct SiestaComplication: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "SiestaComplication", provider: SiestaProvider()) { _ in
            SiestaEntryView()
        }
        .configurationDisplayName("Start Siesta")
        .description("Tap the hammock to open Siesta and start your nap timer.")
        .supportedFamilies([
            .accessoryCircular,
            .accessoryCorner,
            .accessoryInline,
            .accessoryRectangular,
        ])
    }
}

@main
struct SiestaComplicationBundle: WidgetBundle {
    var body: some Widget {
        SiestaComplication()
    }
}
