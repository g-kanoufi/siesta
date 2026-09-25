# Platform Capabilities — Siesta

Researched: 2026-09-25. Sources: Apple/Expo docs, Health Services docs, and public
sleep-app engineering notes (NapValidator, SleepTrigger, SleepPhaseWakeApp).

> **Rule:** never fake a capability. Where detection is a heuristic, the UI copy
> says so. Where a capability is unavailable, we ship the best honest fallback.

## Capability matrix

| Capability              | watchOS (Apple Watch)                                    | Wear OS                                             |
|-------------------------|----------------------------------------------------------|-----------------------------------------------------|
| JS/RN runtime           | ❌ None. SwiftUI + WatchKit only                          | ❌ None. Kotlin + Compose for Wear OS only           |
| Real-time sleep-onset API | ❌ Does not exist. HealthKit sleep data is post-hoc      | ❌ Does not exist. Health Connect data is post-hoc   |
| Sensor access for detection | HR via `HKWorkoutSession` + `HKLiveWorkoutBuilder`; motion via CoreMotion `CMDeviceMotion` during the session | HR via Health Services `MeasureClient`/`PassiveMonitoringClient`; accelerometer via `SensorManager` under a foreground service |
| Background execution    | `HKWorkoutSession` keeps app alive while running; `WKExtendedRuntimeSession` (mindful/physical alarm types) as alternative | Foreground service (`health` type) + wake lock       |
| Scheduled wake (works if app suspended) | `UNNotificationRequest` (haptic + optional sound)       | `AlarmManager.setExactAndAllowWhileIdle` + notification (needs `SCHEDULE_EXACT_ALARM` + `POST_NOTIFICATIONS`) |
| Haptic control          | `WKInterfaceDevice.play()` — **fixed** types only (notification, success, failure, retry, start, stop, click, …); escalation = sequence + timing | `Vibrator` + `VibrationEffect.createWaveform(timings, amplitudes)` — **full** custom patterns |
| Sound                   | Notification sound only; no third-party loud-alarm API   | Notification channel sound, or media in foreground service |
| Complications           | WidgetKit `accessory*` families                          | Tiles + `ComplicationDataSource`                    |
| Health permissions      | HealthKit authorization sheet on watch                   | Health Connect permissions (on-watch, Play-era devices) |
| App distribution        | Inside iOS host app (Expo target) or standalone via watch App Store | Standalone Wear OS app on Play; phone companion optional |
| Paid app (€2.99)        | App Store price tier — **no IAP code, no backend**       | Play price tier — **no billing code, no backend**    |

## Sleep-detection strategy (the honest version)

No platform exposes "the user just fell asleep." Every consumer app that behaves
as if it does uses a heuristic:

1. Arm a session (`HKWorkoutSession` / foreground service).
2. Sample heart rate continuously + motion opportunistically.
3. Detect sleep onset when HR shows a sustained drop relative to the session
   baseline **and** motion stays below threshold for a confirmation window.

Known constraints from real-world testing (NapValidator findings):

- Wrist **motion throttles to ~0 within ~5 min of stillness** on watchOS —
  motion alone is unreliable; **HR is the primary signal**, motion is the
  disqualifier (any sustained motion → not asleep).
- On ~5 s averaged HR, onset detection is feasible; sleep *staging* is not
  reliable enough to build product promises on.

### Fallbacks (in priority order)

| Situation                        | Fallback                                                        |
|----------------------------------|------------------------------------------------------------------|
| Sensors available, heuristic low-confidence | Detection still fires; copy says "estimated", never "we know"    |
| Health permission denied         | Manual-start mode: "Start timer now" — no detection claims       |
| Sensor unavailable mid-session   | Graceful degradation to elapsed-time countdown + honest messaging |
| Everything fails                 | Plain timer — the product degrades to an ordinary nap timer, honestly |

## Confirmed platform facts

- **React Native does not support watchOS** (Expo docs, verbatim). Watch app
  source lives in `apps/mobile/targets/watch` as SwiftUI, via
  `@bacons/expo-apple-targets`, so it survives `expo prebuild`.
- There is no production React Native target for Wear OS. The Wear OS app is a
  separate Gradle project under `apps/wearos`.
- watchOS apps require a paired iOS host when built through Expo — which we
  need anyway for onboarding, purchase framing, and HealthKit priming.

## What still needs physical-device validation

- [ ] HR sampling cadence during `.mindAndBody` workout on current watchOS
- [ ] Whether `WKExtendedRuntimeSession` alone suffices (lower battery) or a
      workout session is required for HR streaming
- [ ] Actual onset-detection accuracy vs. user-perceived "it noticed"
- [ ] Battery drain per nap (target: <5% for a 90-min session)
- [ ] Wear OS `MeasureClient` HR cadence on Pixel Watch vs. Galaxy Watch
- [ ] Exact-alarm behavior when watch is in battery-saver / bedtime mode
