// swift-tools-version: 5.10
import PackageDescription

let package = Package(
    name: "SiestaDomain",
    platforms: [.watchOS(.v10), .iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "SiestaDomain", targets: ["SiestaDomain"]),
        .library(name: "SiestaDomainMocks", targets: ["SiestaDomainMocks"]),
    ],
    targets: [
        .target(name: "SiestaDomain"),
        .target(name: "SiestaDomainMocks", dependencies: ["SiestaDomain"]),
        .testTarget(
            name: "SiestaDomainTests",
            dependencies: ["SiestaDomain", "SiestaDomainMocks"]
        ),
    ]
)
