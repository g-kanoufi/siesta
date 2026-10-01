# Design

> Calm. Warm. Quiet. Tactile. Premium. Slightly playful. Intentional.
> The app says: "Relax. I've got this."

## Tokens

Single source of truth: `@siesta/design-tokens`. Components consume tokens;
nobody hardcodes hexes or durations.

- **Color** — semantic roles (`background`, `surface`, `textPrimary`,
  `accent`, …) in light + dark. Warm sand into cool stone in light, deep
  charcoal with amber dusk in dark. Tests enforce WCAG AA for surfaces and
  gradient stops.
- **Type** — system font only, roles: `title`, `heroNumber`, `heroUnit`,
  `body`, `supporting`, `action`, `caption`. The duration number dominates.
- **Spacing** — 4-pt grid (`xxs`–`screen`); pill radii for controls.
- **Motion** — named primitives only: `springGentle`, `springStandard`,
  `springSnappy`, `springBounce`, `fadeIn/Out`, `scaleIn/Out`, `press`,
  plus ambient (`breathe`, `sway`, `rise`) for the hammock. Every primitive
  ships a required `reducedMotion` alternative.

## The mark

- The wordmark lockup uses the OG hammock silhouette in tone-on-tone dark
  navy, centered on the subtle dusk-to-dawn gradient.
- No sun, water, ropes, teal, or light-blue hammock details.
- The standalone Watch/mobile icon keeps the same crisp, navy-only silhouette;
  depth comes from dark shading rather than blur or fine folds.

## The screen (watch)

```
    hammock logo tile
      Start siesta        ← one primary action, ≥44pt/48dp target
       20 min             ← heroNumber, instantly readable
  starts when you drift off
       15  20  25         ← compact preset window
```

The three-option duration window follows the remembered preset across the list:
10, 15, **20**, 25, 30, 45, 60, 90. Twenty minutes is the fallback.

## The hammock

The hammock *is* the product's pulse — a state machine of motion, all
ambient-table values, all off under Reduce Motion:

| State              | Behavior                                        |
|--------------------|-------------------------------------------------|
| idle               | almost perfectly still                          |
| selected           | small settle dip                                |
| starting           | one dip, then quiet (button compresses too)     |
| waiting_for_sleep  | `breathe` — 4.2 s period, 1.8 % scale           |
| sleeping           | `sway` — 6.2 s period, 1.6 °                    |
| waking             | `rise` spring — rises, settles, screen brightens |
| completed          | still                                           |

Felt, not watched. If you notice it running, it's too much.

## Wake

Haptics first. `WAKE_PATTERNS` (in `@siesta/core`) are escalating pulse/pause
data — gentle (default), normal, strong. Sound is optional and soft; the
scheduled platform notification remains the durable wake path. Copy on wake:
**Welcome back.** — understated, no fireworks.

## Copy voice

Short, warm, human, confident. "Sleep detected." "We'll wake you gently."
"Waiting for sleep…" Never cute, never exclamation points, never medical
claims.

## Accessibility contract

- VoiceOver/TalkBack: "20 minutes. Selected." / "Siesta in progress.
  17 minutes remaining." / "Start siesta."
- State is never color-only — icon + label + motion together.
- ≥44 pt / 48 dp targets, Dynamic Type, Reduce Motion honored via tokens.
- Error states are calm and offer a path: "We couldn't access sleep data."
  → "Check Health permissions" or "Start without detection."
