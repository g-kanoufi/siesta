# ADR 0001 — Watch apps are native; Expo hosts the companion

## Status

Accepted — 2026-09-25

## Context

The master brief specifies React Native + Expo as the primary stack, with the
watch as the primary product. These conflict: React Native has no watchOS or
Wear OS runtime. Expo's own documentation states watch apps "must be built in
pure Swift/SwiftUI."

## Decision

- `apps/mobile` — Expo React Native app (iOS companion host; optional Android
  companion). Owns onboarding, permissions framing, settings, purchase UI.
- `apps/mobile/targets/watch` — native SwiftUI watchOS app via
  `@bacons/expo-apple-targets`. This keeps Expo as the project foundation while
  satisfying the platform constraint; watch source survives `expo prebuild`.
- `apps/wearos` — standalone Kotlin + Compose for Wear OS Gradle project.
  Standalone (not an Expo module) because a Wear OS app does not need a phone
  host, and a separate Gradle build avoids fighting `expo prebuild` on Android.
- `packages/domain-apple` (SwiftPM) and `packages/domain-wear` (Kotlin) —
  native ports of the domain, shared with the watch targets as local packages.

## Consequences

- The watch UX is 100% native: correct widgets, complications, haptics, and
  platform animation primitives — the only path to "feels like an Apple app."
- Domain logic is duplicated across TypeScript/Swift/Kotlin, mitigated by
  ADR 0002's shared test vectors.
- Expo remains the repo's organizing tool for the Apple side (one `npx expo
  prebuild` produces iOS + watch targets together).
