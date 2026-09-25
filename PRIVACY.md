# Privacy

Siesta's privacy posture is a feature, not a disclaimer.

## What the app does with data

| Data                          | Where it goes          |
|-------------------------------|------------------------|
| Heart-rate & motion samples   | Nowhere. Processed on-watch, in memory, discarded when the nap ends. |
| Nap duration choice           | Nowhere. Stored on-device only if a nap is armed. |
| Sleep onset timestamp         | Nowhere. Exists for the life of the session only. |
| Wake times                    | Nowhere. |
| Analytics, telemetry, ads     | **None. No SDKs, no beacons, no identifiers.** |
| Accounts                      | **None.** |
| Backend servers               | **There is no backend.** |

## Principles

- **On-device only.** Physiological data is processed by the onset heuristic
  on the watch itself and discarded — never written, synced, or uploaded.
- **Minimal persistence.** One `NapSessionSnapshot` (id, duration, state,
  timestamps) lives in on-device storage solely so a nap survives a restart.
- **No medical claims.** Siesta *estimates* sleep onset from heart rate and
  motion; it does not diagnose sleep or make health claims.
- **Permissions late and honestly.** Health/sensor permission is requested
  at the moment it's needed, with a plain-language reason — never on first
  launch, and the app degrades honestly without it (manual-start mode).

## Store listings

When publishing, declare: *Data Not Collected* (App Store privacy
nutrition label) and the equivalent Play Data Safety answers — the
architecture makes those literally true.
