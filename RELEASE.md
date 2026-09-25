# Release

Siesta ships as a **€2.99 one-time purchase** per platform. No accounts,
no backend, no subscription, no staged rollout infrastructure — the
release is the store listing plus the binaries.

## Preconditions

- [ ] `npm run lint` — clean
- [ ] `npm run typecheck` — clean (all workspaces incl. `astro check`)
- [ ] `npm test` — all Jest suites green
- [ ] `npm run test:vectors` — vectors regenerate with zero drift
- [ ] `swift test` in `packages/domain-apple` — 6/6 green
- [ ] `gradle test` in `packages/domain-wear` — 6/6 green
- [ ] `npx expo lint` and `npx tsc --noEmit` in `apps/mobile` — clean
- [ ] `xcodebuild` SiestaWatch scheme — succeeds for watchOS Simulator
- [ ] `npx astro build` in `apps/web` — succeeds
- [ ] `npm audit` — no new runtime vulnerabilities (see known-findings below)
- [ ] Physical-device pass per `TESTING.md` (haptics, HealthKit prompt,
      backgrounding, recovery)

## Apple (iOS companion + watchOS app)

1. Set `ios.appleTeamId` in `apps/mobile/app.json` (required by
   `@bacons/apple-targets` for correct watch target signing).
2. `npx expo prebuild -p ios --clean` — regenerates `ios/` including the
   SiestaWatch target and HealthKit entitlements.
3. `pod install` in `apps/mobile/ios`.
4. Open `Siesta.xcworkspace`, set signing for both `Siesta` and
   `SiestaWatch` targets.
5. Archive `Siesta` — the watch app embeds automatically via
   Embed Watch Content.
6. App Store Connect: one listing covers both apps. Screenshots needed:
   watch face + companion home.

## Android (companion + Wear OS app)

The Wear OS app (`apps/wear`, Kotlin/Compose) is not yet implemented —
`packages/domain-wear` is the verified domain port it will consume.
When it lands:

1. Version both apps identically; Wear OS ships as a companion artifact
   in the same Play Console listing (multi-APK or app bundle).
2. Play Console listing needs watch + phone screenshots.

## Website

`apps/web` is a static Astro site. `npx astro build` produces `dist/` —
deploy to any static host and point `siesta.app` at it. No server code,
no environment variables.

## Known dependency findings (build tooling only)

`npm audit` reports transitive vulnerabilities in `@bacons/xcode` /
`@expo/*` prebuild tooling and `query-string` (expo-router). None ship
in runtime code. Accepted risk for build tooling; the expo-router
`query-string` finding is upstream-pending and will be re-evaluated on
the next Expo SDK bump. Do not `audit fix --force` — it upgrades
expo-router to a major version incompatible with SDK 57.

## Post-release

- HealthKit permission copy and the "not a medical device" line must
  stay in every listing and in-app string — it's an App Store review
  requirement and our own honesty bar.
- Vector drift between `main` releases means a domain change landed
  without updating native ports — treat as a release blocker.
