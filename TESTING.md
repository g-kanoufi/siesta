# Testing

## Pyramid

```
        E2E on hardware (Phases 5–7)          few, manual, real watches
      UI tests (per platform)                 component/interaction
    Vector replay (Swift, Kotlin)             ports must stay identical
  Jest unit tests (@siesta/core)              canonical domain, TDD first
```

## Canonical domain — `packages/core`

```sh
cd packages/core && npx jest
```

TDD: write the failing test, implement, refactor. Covers the machine
(exhaustive transition table), durations, wake math (midnight, DST,
fail-safe, clamping), the onset heuristic (baseline → confirmation →
retroactive onset timestamp, motion reset, motion-only mode, latch), and the
full session lifecycle including post-crash recovery and the observer stream.

## Shared vectors — `packages/test-vectors`

```sh
npm run test:vectors          # regenerate packages/test-vectors/vectors/*.json
cd packages/test-vectors && npx jest   # drift-guard: committed == generated
```

If the domain changes, regenerate vectors **and** re-run both ports.

## Native ports

```sh
cd packages/domain-apple && swift test
cd packages/domain-wear   && gradle test
```

Both replay `transitions.json`, `wake.json`, `failSafe.json`, `onset.json`,
`scenarios.json`, and verify `constants.json` parity. A port that diverges
fails its own suite — that is the contract for "identical domain."

## Design tokens — `packages/design-tokens`

Tests compute WCAG contrast ratios from the hex values. A palette change
that breaks AA fails CI — accessibility is enforced, not hoped for.

## Platform/E2E (Phases 5–7, on hardware)

Milestone 1 is the sleep-detection/wake loop itself — see
[docs/HARDWARE_VALIDATION.md](docs/HARDWARE_VALIDATION.md) for the experiment
protocol (E1–E12), the probe event schema, and log-pull instructions. Both
watch apps emit `probe.jsonl`; `npm run probe:report` turns it into the
answers table.

- [x] watchOS: HealthKit permission flow logging, HKWorkoutSession cadence,
      UNNotificationRequest delivery timing, ERS smart-alarm wake channel —
      probe events `hr_auth`, `hr_sample`, `alarm_*`, `ers_*`
- [x] Wear OS: Health Services exercise session, health-type foreground
      service, exact-alarm permission check, WakeReceiver env capture
- [ ] Recovery matrix: force-quit, watch restart, phone restart, Bluetooth
      drop, permission revoked mid-nap, midnight/DST/timezone, low battery —
      E10 covers kill; rest scheduled after M1 findings
- [ ] Accessibility: VoiceOver, TalkBack, Reduce Motion, larger text,
      high contrast
