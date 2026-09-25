# Accessibility

Siesta's core interaction must work for everyone who naps — including
users who can't see a tiny watch face, can't hear an alarm, or can't
tolerate motion. Accessibility is a shipping requirement, not a phase.

## Principles

1. **The wake is haptic-first.** The default wake mechanism is wrist
   haptics, which serves deaf and hard-of-hearing users by design. Sound
   is optional and secondary on every platform.
2. **One screen, large type.** The watch UI has exactly one decision on
   screen at a time. The hero number is 44 pt on watchOS and 56 pt on the
   phone companion — readable at arm's length, at night, without glasses.
3. **Motion explains, never decorates.** Every ambient animation has a
   state reason and a reduced-motion fallback that removes it entirely.

## Motion

`packages/design-tokens` encodes two motion layers:

- `motion.*` — interaction springs and timings (press dip, chip select,
  sheet transitions)
- `ambient.*` — the continuous hammock motions (`breathe`, `sway`,
  `rise`), each flagged `disabledUnderReduceMotion`

Platform behavior:

| Platform | Honor mechanism |
| --- | --- |
| iOS / Android companion | `useReducedMotion()` (Reanimated) — all shared values settle to rest when Reduce Motion is on |
| watchOS | `accessibilityReduceMotion` / SwiftUI `@Environment` — ambient animation skipped |
| Website | `prefers-reduced-motion: reduce` — sway, reveal, and smooth-scroll all disabled (verified in browser) |

## Color & contrast

The palette is validated computationally in
`packages/design-tokens/test/tokens.test.ts`:

- Primary text: WCAG AA (≥ 4.5:1) on every surface
- Secondary text: WCAG AA for normal text
- Tertiary text: ≥ 3:1 (large/incidental text)
- Accent on background: ≥ 3:1 for non-text UI
- `onAccent` label on accent: ≥ 4.5:1

Any palette change that breaks contrast fails CI before it can ship.

## Touch & control targets

- Minimum touch target: **44 × 44 pt** (iOS) / **48 × 48 dp** (Android),
  encoded in `accessibility.minTouchTarget` tokens
- Watch controls are full-width buttons reachable with one thumb;
  duration selection uses the Digital Crown (native wheel picker), which
  needs no precision tapping
- Every interactive element has an `accessibilityLabel` /
  `contentDescription`; decorative elements (hammock glyph, posts) are
  hidden from assistive tech

## Assistive technology specifics

- **VoiceOver / TalkBack**: duration chips are a `radiogroup` of `radio`
  items with selected state; the "recommended" preset appends
  "Recommended" to its label
- **Live regions**: status changes ("Waiting for sleep…", countdown)
  announce via `accessibilityLiveRegion="polite"`; the countdown itself
  announces in whole minutes, not every second
- **Reduced motion**: see above — verified with emulated media on the
  website and Reanimated's `useReducedMotion` in the app
- **Fail-safe honesty**: the waiting state states the latest wake time
  in text, so users who can't perceive the animation still know the
  deadline

## Known limitations & testing gaps

- Physical-device VoiceOver pass on watchOS is pending hardware
- Wake haptic intensity settings (gentle/normal/strong) exist in the
  domain but the settings UI is not yet shipped — default is `normal`
- The website has been verified at desktop and mobile widths with
  reduced-motion emulation; a full screen-reader pass (VoiceOver +
  TalkBack) is scheduled for release QA

## Testing

- Unit: contrast, touch-target, and reduced-motion tokens are tested in
  `packages/design-tokens/test/`
- Manual: checklist in `TESTING.md` — device font scaling, VoiceOver
  walkthrough, reduced-motion walkthrough
- Browser: reduced-motion verified via emulated media in CI preview
