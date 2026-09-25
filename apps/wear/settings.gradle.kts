pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
    }
    // The canonical Kotlin domain lives in the workspace — composite build
    // keeps it the single source of truth, same as the watchOS target.
    includeBuild("../../packages/domain-wear")
}

rootProject.name = "siesta-wear"
include(":app")
