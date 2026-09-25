import XCTest
import SiestaDomainMocks
@testable import SiestaDomain

final class TransitionVectorTests: XCTestCase {
    func testAllTransitions() throws {
        let vectors = try loadVector("transitions", as: TransitionCase.self)
        XCTAssertEqual(vectors.version, 1)
        XCTAssertEqual(vectors.cases.count, 81)
        for c in vectors.cases {
            XCTAssertEqual(
                transition(c.from, c.event.event), c.to,
                "\(c.from) + \(c.event.type) should be \(c.to)"
            )
        }
    }
}

final class WakeVectorTests: XCTestCase {
    func testWakeTimes() throws {
        let vectors = try loadVector("wake", as: WakeCase.self)
        for c in vectors.cases {
            XCTAssertEqual(
                computeWakeAtMs(
                    sleepDetectedAtMs: c.sleepDetectedAtMs,
                    durationMinutes: c.durationMinutes
                ),
                c.expectedWakeAtMs
            )
        }
    }

    func testFailSafe() throws {
        let vectors = try loadVector("failSafe", as: FailSafeCase.self)
        for c in vectors.cases {
            XCTAssertEqual(
                computeFailSafeWakeAtMs(
                    armedAtMs: c.armedAtMs,
                    durationMinutes: c.durationMinutes,
                    graceMinutes: c.graceMinutes
                ),
                c.failSafeWakeAtMs
            )
        }
    }
}

final class OnsetVectorTests: XCTestCase {
    func testOnsetDetection() throws {
        let vectors = try loadVector("onset", as: OnsetCase.self)
        for c in vectors.cases {
            let detector = SleepOnsetDetector(config: c.config)
            for s in c.samples {
                detector.feed(
                    PhysioSample(atMs: s.atMs, heartRate: s.heartRate, motion: s.motion)
                )
            }
            XCTAssertEqual(detector.onsetAtMs, c.expectedOnsetAtMs, c.name)
        }
    }
}

final class ScenarioVectorTests: XCTestCase {
    func testScenarios() async throws {
        let vectors = try loadVector("scenarios", as: ScenarioCase.self)
        for c in vectors.cases {
            try await replay(c)
        }
    }

    private func replay(_ c: ScenarioCase) async throws {
        let clock = ManualClock(c.startMs)
        let sleep = MockSleepDetectionService()
        let scheduler = RecordingAlarmScheduler()
        let haptics = RecordingHaptics()
        let store = InMemorySessionStore()
        var ids = 0
        let newId = { () -> String in
            ids += 1
            return "nap-\(ids)"
        }
        var m = NapSessionManager(
            clock: clock, sleep: sleep, scheduler: scheduler,
            haptics: haptics, store: store, newId: newId
        )

        for op in c.ops {
            switch op.op {
            case "select": try m.selectDuration(op.minutes!)
            case "start": try await m.start()
            case "startManually": try m.startManually()
            case "advance": clock.set(op.toMs!)
            case "sleepDetected": sleep.simulateSleep(atMs: op.atMs!)
            case "tick": m.tick()
            case "acknowledge": m.acknowledgeWake()
            case "cancel": m.cancel()
            case "dismiss": m.dismiss()
            case "resume":
                clock.set(op.atMs!)
                m = await NapSessionManager.resume(
                    clock: clock, sleep: sleep, scheduler: scheduler,
                    haptics: haptics, store: store, newId: newId
                )
            default:
                XCTFail("\(c.name): unknown op \(op.op)")
            }
        }

        let e = c.expected
        XCTAssertEqual(m.state, e.state, c.name)

        if let expectedSession = e.session {
            let s = try XCTUnwrap(m.snapshot, "\(c.name): expected a session")
            XCTAssertEqual(s.state, expectedSession.state, c.name)
            XCTAssertEqual(
                s.selectedDurationMinutes,
                expectedSession.selectedDurationMinutes, c.name
            )
            XCTAssertEqual(s.armedAtMs, expectedSession.armedAtMs, c.name)
            XCTAssertEqual(s.sleepDetectedAtMs, expectedSession.sleepDetectedAtMs, c.name)
            XCTAssertEqual(s.expectedWakeAtMs, expectedSession.expectedWakeAtMs, c.name)
            XCTAssertEqual(s.failSafeWakeAtMs, expectedSession.failSafeWakeAtMs, c.name)
        } else {
            XCTAssertNil(m.snapshot, "\(c.name): expected no session")
        }

        XCTAssertEqual(m.remainingMs(), e.remainingMs, c.name)
        XCTAssertEqual(
            scheduler.scheduled.map { AlarmDTO(atMs: $0.atMs, kind: $0.kind, sessionId: $0.sessionId) },
            e.scheduledAlarms, c.name
        )
        XCTAssertEqual(haptics.played, e.wakePatternsPlayed, c.name)
    }
}

final class ConstantsVectorTests: XCTestCase {
    struct ConstantsFile: Decodable {
        struct Values: Decodable {
            let napStates: [String]
            let durationPresets: [NapDurationPreset]
            let failSafeGraceMinutes: Int
            let onsetConfig: SleepOnsetConfig
            let wakePatterns: [String: WakePattern]
        }
        let version: Int
        let values: Values
    }

    func testConstantsMatchCore() throws {
        let url = vectorsDir.appending(path: "constants.json")
        let file = try JSONDecoder().decode(
            ConstantsFile.self,
            from: Data(contentsOf: url)
        )
        let v = file.values

        XCTAssertEqual(v.napStates, NapState.allCases.map(\.rawValue))
        XCTAssertEqual(v.durationPresets, napDurationPresets)
        XCTAssertEqual(v.failSafeGraceMinutes, defaultFailSafeGraceMinutes)
        XCTAssertEqual(v.onsetConfig, defaultOnsetConfig)
        XCTAssertEqual(Set(v.wakePatterns.keys), Set(WakeIntensity.allCases.map(\.rawValue)))
        for (name, pattern) in v.wakePatterns {
            XCTAssertEqual(wakePatterns[WakeIntensity(rawValue: name)!], pattern)
        }
    }
}
