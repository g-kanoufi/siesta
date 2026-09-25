# Siesta

A tiny, beautiful watch application that lets you choose how long you want to
nap, waits until you actually fall asleep, and gently wakes you when your
siesta is over.

**Choose. Sleep. Wake.**

## Layout

```
apps/
  mobile/        Expo React Native — iOS companion host (+ optional Android)
    targets/watch/   watchOS SwiftUI app (via @bacons/apple-targets)
  wearos/        Kotlin + Compose for Wear OS (planned — domain port is ready)
  web/           siesta.app — Astro marketing site
packages/
  core/          Canonical domain — TypeScript, fully tested (@siesta/core)
  design-tokens/ Color, typography, spacing, motion tokens (@siesta/design-tokens)
  domain-apple/  Swift port of the domain (SwiftPM, tested against vectors)
  domain-wear/   Kotlin port of the domain (Gradle, tested against vectors)
  test-vectors/  Shared JSON test vectors generated from @siesta/core
docs/
  PLATFORM_CAPABILITIES.md
  adr/           Architecture decision records
```

The watch is the product. The companion apps are minimal. There is no backend.

## Why native watch apps in an Expo repo?

React Native does not run on watchOS or Wear OS — this is a platform
constraint, not a preference. The watch apps are SwiftUI/Kotlin; the domain is
kept identical across platforms through shared test vectors. See
[ADR 0001](docs/adr/0001-native-watch-apps.md) and
[PLATFORM_CAPABILITIES.md](docs/PLATFORM_CAPABILITIES.md).

## Develop

```sh
npm install
npm test                # all workspace tests
npm run typecheck
npm run test:vectors    # regenerate shared test vectors
```

Native ports:

```sh
cd packages/domain-apple && swift test     # Apple platform domain
cd packages/domain-wear && ./gradlew test  # Wear OS domain (needs JDK)
```

## Principles

- One problem. One screen. One magical interaction.
- On-device everything. No accounts, no analytics, no backend.
- Haptics first, sound optional, never an aggressive alarm.
- Accessibility is a launch feature, not a retrofit.
- If a feature doesn't make **choose → sleep → wake** better, it doesn't ship.
