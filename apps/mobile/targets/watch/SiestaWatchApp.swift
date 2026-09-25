import SwiftUI

@main
struct SiestaWatchApp: App {
    @StateObject private var viewModel = SessionViewModel()

    var body: some Scene {
        WindowGroup {
            ContentView(viewModel: viewModel)
                .task { await viewModel.start() }
        }
    }
}
