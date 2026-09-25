# ADR 0002 — TypeScript canonical domain + native ports with shared test vectors

## Status

Accepted — 2026-09-25

## Context

The domain (durations, nap state machine, wake-time math, session persistence
schema) is small (~a few hundred lines) but must be behaviorally identical on
watchOS, Wear OS, and the companion apps. Options:

1. **TypeScript canonical + ports.** `packages/core` is the reference
   implementation with a full Jest suite. It emits JSON test vectors; the Swift
   and Kotlin ports replay the same vectors in their own test suites.
2. **Kotlin Multiplatform.** One Kotlin domain compiled to JVM (Wear OS) and
   Native/XCFramework (watchOS).
3. **Independent native implementations.** No shared spec; rely on code review.

## Decision

Option 1 — TypeScript canonical + ports.

## Rationale

- The domain is tiny; duplication costs little, KMP toolchain costs much
  (Kotlin/Native builds, XCFramework wiring into an apple-targets watch target,
  slower CI).
- `packages/core` has real consumers anyway: the RN companion uses it directly,
  the website can reuse it for the interactive demo.
- Shared JSON vectors give parity guarantees without build coupling — a port
  that diverges fails its own test suite.
- KMP remains a valid future migration if the domain grows.

## Consequences

- Any domain change requires: update `packages/core`, regenerate vectors
  (`npm run test:vectors`), update both ports, keep all suites green.
- Ports must be mechanical — no platform-specific "improvements" to domain logic.
