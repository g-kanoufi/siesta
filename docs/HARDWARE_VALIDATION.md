# Hardware Validation — Milestone 1

Prove, on real hardware (not simulators, not mocks), whether the core
sleep-detection/wake loop works. Both watch apps are instrumented with a
probe that writes a JSONL event log on-device; every experiment below is a
sequence of steps plus the log evidence that answers the question.

## The ten questions

| # | Question | Experiment(s) |
|---|----------|---------------|
| 1 | Can the app know when the person falls asleep? | E2 |
| 2 | How quickly does that information become available? | E1, E2 |
| 3 | Can the app remain active/backgrounded long enough? | E3, E6 |
| 4 | Can it schedule a guaranteed wake? | E4, E10 |
| 5 | Does haptic wake work reliably? | E5 |
| 6 | What happens if the phone isn't nearby? | E7 |
| 7 | What happens if the watch is locked? | E8 |
| 8 | What happens in low-power mode? | E9 |
| 9 | What happens if the watch/app gets killed? | E10 |
| 10 | How much battery does monitoring consume? | E11 |

E12 is an edge-case pass: off-wrist / loose band / motion-heavy "naps".

## What's instrumented

**watchOS** (`apps/mobile/targets/watch/`):

- `Probe.swift` — `probe.jsonl` in the app container's Documents
- `WatchServices.swift` — every service logs: `hr_sample`, `hr_gap` (>10 s),
  `onset`, `detector_start/stop`, `workout_state/error`, `hr_auth`,
  `notification_auth`, `alarm_scheduled`, `alarm_delivered` (with `lateMs`),
  `alarm_delivered_while_away`, `haptic_start/stop`, `snapshot_*`
- `ExtendedRuntimeAlarmScheduler` — parallel wake channel: smart-alarm ERS
  (`WKBackgroundModes` `alarm` added to Info.plist). Logs `ers_alarm_scheduled`,
  `ers_session_started`, `ers_haptic_started`, `ers_invalidated`, and
  `ers_attached_on_launch` when the system relaunches the app for a scheduled
  session — including from terminated.
- `ExtendedRuntimeSleepDetector` — `detectorMode=ers` probe flag: ERS keep-alive
  instead of a workout session (E6).
- `SiestaAppDelegate` — `handle(_:)` ERS relaunch + lifecycle events; `boot`
  and `probe_config` at launch.
- `SessionViewModel` — `session_state` transitions with env snapshots
  (battery %, low-power, app state).

**Wear OS** (`apps/wear/`):

- `services/ProbeLog.kt` — `files/probe.jsonl`, same schema (`app` = `wearos`)
- `services/NapMonitorService.kt` — `health`-type foreground service keeping
  the process alive while armed; logs `fgs_create/start_cmd/task_removed/
  destroy` so kills are distinguishable from user swipes
- `services/PlatformServices.kt` — same event set as watchOS plus
  `exercise_state`, `hr_availability`, `alarm_scheduled.canExact`
  (`canScheduleExactAlarms()`), and `alarm_delivered` env: `keyguard`,
  `interactive`, `powerSave`, `batteryPct`
- `SessionViewModel` — starts/stops the FGS on state transitions

**Debug UIs** (debug builds only): "probe" button on the duration screen —
config toggles (watchOS), file size, and a tail of the raw log.

## Build & install

**watchOS** — needs a paired iPhone + Apple Watch and an Apple dev team set
on both `Siesta` and `SiestaWatch` targets:

```sh
cd apps/mobile/ios && pod install   # if Pods/ missing
# Xcode: scheme = SiestaWatch, destination = your Watch (via iPhone)
xcodebuild -workspace Siesta.xcworkspace -scheme SiestaWatch \
  -destination 'platform=watchOS,name=<Your Watch>' \
  -allowProvisioningUpdates build
# or just select the scheme + watch in Xcode and Run
```

**Wear OS** — needs `ANDROID_HOME=/opt/homebrew/share/android-commandlinetools`:

```sh
cd apps/wear
ANDROID_HOME=/opt/homebrew/share/android-commandlinetools \
  ./gradlew :app:installDebug        # watch paired via adb (wireless debug)
```

## Pulling logs

```sh
# Wear OS
adb shell run-as app.siesta.wear cat files/probe.jsonl > probe-wear.jsonl

# watchOS — Xcode ▸ Window ▸ Devices and Simulators ▸ select the Watch ▸
# Siesta ▸ ⋯ ▸ Download Container → Documents/probe.jsonl inside the .xcappdata

# Analyze (both files can go in one report)
npm run probe:report -- probe-watchos.jsonl probe-wear.jsonl
```

## Experiments

Protocol conventions: unless stated otherwise, nap = default 20 min, watch
worn snugly, phone left alone. **Record the experiment id** against each nap
(the session id `nap-*` in the log is the join key). Run E1 first — a broken
baseline invalidates everything downstream.

**Debug shortcut:** in debug builds, a "Simulate sleep" control on the
"Waiting for sleep" screen fires the real onset path (`onset` logged with
`"simulated": true`) — use it to run E3/E4/E5/E7/E8/E10 without actually
sleeping. It is DEBUG-gated and never ships.

### E1 — Sensor baseline (awake)
Arm a nap, stay awake and reasonably still for 15 min, then cancel.
**Look for:** `hr_sample` cadence p50, `hr_gap` count, `detector_start`,
`hr_auth`, `workout_state`/`exercise_state` transitions to active.
**Pass:** samples flow continuously at platform cadence (expect ~1–5 s); no
persistent gaps while watch is on-wrist.

### E2 — Real onset detection
Arm a nap and actually go to sleep (≥ the nap length). Note roughly when you
think you fell asleep.
**Look for:** `onset` event, `session_state → sleeping`,
`alarm_scheduled kind=nap_wake`, `alarm_delivered`.
**Pass:** `onset` fires within a plausible window of perceived sleep time;
`armed→onset` latency and sample cadence answer Q2. False "instant onset" or
never-fires both fail.

### E3 — Backgrounded survival
Same as E2 but immediately press the crown / swipe to the watch face after
arming; do not touch the watch until wake.
**Look for:** `lifecycle background` followed by *continuing* `hr_sample`s;
`fgs_started` on Wear.
**Pass:** samples continue through the whole nap; wake fires on time.

### E4 — Guaranteed wake scheduling
From any armed session, check scheduled vs delivered.
**Look for:** `alarm_scheduled` → `alarm_delivered` `lateMs` (and the ERS
channel on watchOS: `ers_alarm_scheduled` → `ers_session_started`).
**Pass:** every scheduled wake delivers; `lateMs` small (< a few seconds).
Wear: `canExact=true`.

### E5 — Haptic wake reliability
Run ≥3 real naps. Each time, note how long the wake signal ran before you
acknowledged it.
**Look for:** `haptic_start`, `ers_haptic_started`, `wake_ack` latency.
**Pass:** haptics fire and are felt; compare in-app pattern vs ERS `notifyUser`
(system alarm alert, repeats until dismissed) for which is harder to sleep
through.

### E6 — ERS-only keep-alive (watchOS only)
Probe screen → Detector = `ers`. Arm, stay still 35 min (ERS alarm sessions
are capped at 30 min).
**Look for:** `detector_start mode=ers`, `ers_session_started`, continuing
`hr_sample`s without a workout session, `ers_invalidated` timing.
**Pass criteria (informational):** if HR streams at cadence and the session
survives ≥30 min at lower battery cost than E11 workout-mode, ERS becomes a
candidate primary path; if samples stall or the session dies early, workout
mode is confirmed necessary.

### E7 — Phone absent
Airplane mode on the phone (or leave it home). Run E2+E4 on the watch alone.
**Look for:** identical event set to E2 — the loop is fully on-device.
**Pass:** onset, sleeping transition, and wake all fire with the phone away.
Wear: confirm no dependency on the phone companion.

### E8 — Locked watch
Set a watch passcode; arm a nap, let the wrist drop so the watch locks.
**Look for:** `alarm_delivered` env (`keyguard`, `interactive` on Wear) and
whether haptic/alert still presented; on watchOS, `hr_sample` continuity
while locked.
**Pass:** detection + wake unaffected by lock.

### E9 — Low-power mode
Enable Low Power Mode (watchOS) / Battery Saver (Wear). Run a full nap.
**Look for:** `lowPower`/`powerSave` in env snapshots; HR cadence/gap deltas
vs E1; alarm punctuality.
**Pass:** either the loop still works, or we document the degradation
boundary (e.g. HR throttled → detection latency up) honestly.

### E10 — Kill test
Arm a nap, wait 5 min, then kill the app (watchOS: side button → dock →
swipe the card up / power off watch; Wear: recents → swipe). **Do not
reopen.**
**Look for:** on next launch — `boot`, `snapshot_load found`, reconcile
events, `alarm_delivered_while_away` (watchOS), `alarm_delivered` (Wear),
`ers_attached_on_launch` if the ERS alarm fired, `fgs_task_removed`/`fgs_destroy`.
**Pass:** the scheduled wake still reaches the user after process death.
Detection need not survive the kill (it can't) — the *wake* must.

### E11 — Battery cost
Charge to ~100%. Run one armed session ≥60 min (detectorMode=workout, then
repeat with =ers on watchOS if E6 passed). Note battery % before/after —
the probe logs it at every milestone event.
**Look for:** battery delta over session length → %/hr.
**Pass:** <5% for a 90-min nap target (see PLATFORM_CAPABILITIES).

### E12 — Edge cases
- Watch off-wrist on a table: expect `hr_gap`s / availability loss — logs
  should show honest degradation, not fake detection.
- Loose band nap: sample quality drop → more gaps.
- Active "nap" (walk around): motion should *not* produce a sleep onset.

## Results matrix

| Exp | watchOS result | Wear result | Evidence (events) |
|-----|----------------|-------------|-------------------|
| E1  |                |             |                   |
| E2  |                |             |                   |
| …   |                |             |                   |

## Reading the log

Key fields per event: `t` (epoch ms), `ev`, `session`, `d` (payload).
Environment snapshots (`batteryPct`, `lowPower`/`powerSave`, `keyguard`,
`appState`/`interactive`) ride on `boot`, `session_state`, `detector_start`,
`alarm_delivered`, `ers_*` events — correlate them with `hr_gap`s to explain
gaps in detection.
