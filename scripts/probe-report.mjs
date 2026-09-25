#!/usr/bin/env node
/**
 * Probe log analyzer — turns a probe.jsonl pulled from a watch into the
 * per-nap answers for docs/HARDWARE_VALIDATION.md.
 *
 *   node scripts/probe-report.mjs <probe.jsonl> [more.jsonl...]
 *
 * The schema is platform-neutral ({t, app, v, ev, session?, d}) — watchOS
 * and Wear OS logs can be analyzed side by side in one invocation.
 */
import { readFileSync } from "node:fs";

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("usage: node scripts/probe-report.mjs <probe.jsonl> [more.jsonl...]");
  process.exit(1);
}

const events = [];
for (const file of files) {
  for (const [i, line] of readFileSync(file, "utf8").split("\n").entries()) {
    if (!line.trim()) continue;
    try {
      const ev = JSON.parse(line);
      ev._file = file;
      events.push(ev);
    } catch {
      console.error(`${file}:${i + 1}: unparseable line skipped`);
    }
  }
}
events.sort((a, b) => a.t - b.t);

const fmtMs = (ms) => {
  if (ms == null || Number.isNaN(ms)) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m${s % 60}s`;
};
const fmtT = (t) => new Date(t).toISOString().slice(11, 19);
const pct = (sorted, p) =>
  sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : null;

// ---- group by nap session -------------------------------------------------
const sessions = new Map(); // sessionId -> events[]
const orphan = [];
for (const ev of events) {
  const key = ev.session ?? null;
  if (!key) { orphan.push(ev); continue; }
  if (!sessions.has(key)) sessions.set(key, []);
  sessions.get(key).push(ev);
}

// ---- per-session analysis -------------------------------------------------
const rows = [];
for (const [id, evs] of sessions) {
  const d = (ev) => ev.d ?? {};
  const app = evs[0].app;
  const armed = evs.find((e) => e.ev === "arm_begin") ?? evs[0];
  const samples = evs.filter((e) => e.ev === "hr_sample");
  const gaps = evs.filter((e) => e.ev === "hr_gap");
  const onset = evs.find((e) => e.ev === "onset");
  const scheduled = evs.filter((e) => e.ev === "alarm_scheduled" || e.ev === "ers_alarm_scheduled");
  const delivered = evs.filter((e) =>
    e.ev === "alarm_delivered" || e.ev === "alarm_delivered_while_away" ||
    e.ev === "ers_session_started");
  const states = evs.filter((e) => e.ev === "session_state");
  const boots = evs.filter((e) => e.ev === "boot" || e.ev === "ers_attached_on_launch");
  const kills = evs.filter((e) => e.ev === "fgs_task_removed" || e.ev === "fgs_destroy");
  const haptics = evs.filter((e) => e.ev === "haptic_start" || e.ev === "ers_haptic_started");
  const wakeAck = evs.find((e) => e.ev === "wake_ack");

  // HR cadence — the latency floor for "how quickly can it know".
  const times = samples.map((s) => s.t);
  const deltas = times.slice(1).map((t, i) => t - times[i]).sort((a, b) => a - b);
  const firstSample = samples[0];
  const lastSample = samples[samples.length - 1];
  const coverageS = firstSample && lastSample ? (lastSample.t - firstSample.t) / 1000 : 0;
  const gapTotal = gaps.reduce((a, g) => a + (d(g).gapMs ?? 0), 0);

  // Alarm punctuality — scheduled atMs vs actual delivery. An undelivered
  // alarm that was cancelled (fail_safe replaced by nap_wake) is expected,
  // not a miss.
  const cancels = evs.filter((e) => e.ev === "alarm_cancelled");
  const alarmPairs = scheduled.map((s) => {
    const kind = d(s).kind;
    const hit = delivered.find((x) => d(x).kind === kind ||
      (d(x).requestId ?? "").includes(kind));
    const cancelled = !hit && cancels.some((c) => c.t > s.t);
    return { kind, atMs: d(s).atMs, lateMs: hit ? d(hit).lateMs ?? hit.t - d(s).atMs : null, hit: !!hit, cancelled };
  });

  // Battery — first and last env snapshot carrying a percentage.
  const bats = evs.map((e) => d(e).batteryPct).filter((b) => b != null);
  const battDelta = bats.length >= 2 ? bats[bats.length - 1] - bats[0] : null;
  const sessionMs = (lastSample?.t ?? evs[evs.length - 1].t) - armed.t;

  const flags = {
    lowPower: evs.some((e) => d(e).lowPower === true || d(e).powerSave === true),
    keyguard: evs.some((e) => d(e).keyguard === true),
    exactAlarm: evs.some((e) => e.ev === "alarm_scheduled" && d(e).canExact === false)
      ? false : true,
    phoneAway: evs.some((e) => d(e).phoneAway === true),
  };

  rows.push({
    id, app, armed,
    durationMs: sessionMs,
    samples: samples.length,
    cadenceP50: pct(deltas, 50),
    cadenceP95: pct(deltas, 95),
    gapCount: gaps.length,
    gapTotalMs: gapTotal,
    maxGap: gaps.reduce((m, g) => Math.max(m, d(g).gapMs ?? 0), 0),
    timeToFirstSample: firstSample ? firstSample.t - armed.t : null,
    onsetAt: onset ? d(onset).atMs : null,
    armedToOnset: onset ? d(onset).atMs - armed.t : null,
    alarmPairs,
    hapticEvents: haptics.length,
    wakeAckLatency: wakeAck && haptics.length ? wakeAck.t - haptics[0].t : null,
    boots: boots.length,
    kills: kills.length,
    battDelta,
    battDrainPerHr: battDelta != null && sessionMs > 0
      ? (battDelta / (sessionMs / 3_600_000)).toFixed(1) : null,
    flags,
    stateTrail: states.map((s) => d(s).to).join(" → "),
  });
}

// ---- print ----------------------------------------------------------------
console.log(`# Probe report — ${files.join(", ")}\n`);
console.log(`${events.length} events · ${sessions.size} session(s) · ${orphan.length} unbound\n`);

for (const r of rows) {
  console.log(`## ${r.id} (${r.app}) — armed ${fmtT(r.armed.t)}\n`);
  console.log(`- duration: ${fmtMs(r.durationMs)} · samples: ${r.samples} · cadence p50 ${fmtMs(r.cadenceP50)} p95 ${fmtMs(r.cadenceP95)}`);
  console.log(`- HR gaps: ${r.gapCount} (total ${fmtMs(r.gapTotalMs)}, max ${fmtMs(r.maxGap)})`);
  console.log(`- first sample after arm: ${fmtMs(r.timeToFirstSample)}`);
  console.log(`- onset detected: ${r.onsetAt ? fmtT(r.onsetAt) : "never"} (armed→onset ${fmtMs(r.armedToOnset)})`);
  for (const a of r.alarmPairs) {
    const status = a.hit ? `delivered ${fmtMs(a.lateMs)} late`
      : a.cancelled ? "cancelled (expected)"
      : "NOT DELIVERED";
    console.log(`- alarm ${a.kind}: ${status}`);
  }
  console.log(`- haptic events: ${r.hapticEvents} · wake ack latency: ${fmtMs(r.wakeAckLatency)}`);
  console.log(`- boots/relaunches during session: ${r.boots} · kills: ${r.kills}`);
  console.log(`- battery delta: ${r.battDelta ?? "—"}% over nap (${r.battDrainPerHr ?? "—"}%/hr)`);
  const f = [];
  if (r.flags.lowPower) f.push("low-power");
  if (r.flags.keyguard) f.push("keyguard-locked");
  if (!r.flags.exactAlarm) f.push("no-exact-alarm-perm");
  if (r.flags.phoneAway) f.push("phone-away");
  console.log(`- flags: ${f.length ? f.join(", ") : "none"}`);
  console.log(`- states: ${r.stateTrail || "—"}\n`);
}

// ---- answers table ----------------------------------------------------------
const any = (pred) => rows.filter(pred);
console.log("## The ten questions\n");
const detected = any((r) => r.onsetAt != null);
console.log(`| # | Question | Answer (from logs) |`);
console.log(`|---|----------|--------------------|`);
console.log(`| 1 | Detects sleep? | ${detected.length}/${rows.length} sessions fired onset |`);
const lat = detected.map((r) => r.armedToOnset).sort((a, b) => a - b);
console.log(`| 2 | How quickly? | armed→onset p50 ${fmtMs(pct(lat, 50))} · p95 ${fmtMs(pct(lat, 95))} |`);
const cad = rows.flatMap((r) => (r.cadenceP50 ? [r.cadenceP50] : []));
console.log(`| 3 | Stays alive backgrounded? | max gap ${fmtMs(Math.max(0, ...rows.map((r) => r.maxGap)))} · cadence p50 ${fmtMs(pct(cad.sort((a, b) => a - b), 50))} |`);
const alarms = rows.flatMap((r) => r.alarmPairs.filter((a) => !a.cancelled));
const deliveredN = alarms.filter((a) => a.hit).length;
const lates = alarms.filter((a) => a.hit && a.lateMs != null).map((a) => a.lateMs).sort((a, b) => a - b);
console.log(`| 4 | Guaranteed wake fires? | ${deliveredN}/${alarms.length} due alarms delivered · p50 late ${fmtMs(pct(lates, 50))} · max ${fmtMs(Math.max(0, ...lates))} |`);
const acks = rows.flatMap((r) => (r.wakeAckLatency ? [r.wakeAckLatency] : []));
console.log(`| 5 | Haptic wake works? | ${rows.filter((r) => r.hapticEvents > 0).length}/${rows.length} haptics fired · ack p50 ${fmtMs(pct(acks, 50))} |`);
console.log(`| 6 | Phone away? | ${rows.filter((r) => r.flags.phoneAway).length} sessions flagged phone-away |`);
console.log(`| 7 | Watch locked? | ${rows.filter((r) => r.flags.keyguard).length} sessions keyguard-locked |`);
console.log(`| 8 | Low-power mode? | ${rows.filter((r) => r.flags.lowPower).length} sessions in low-power |`);
console.log(`| 9 | Survives kill? | ${rows.filter((r) => r.boots > 0 || r.kills > 0).length} sessions saw boot/kill events |`);
const drains = rows.flatMap((r) => (r.battDrainPerHr ? [Number(r.battDrainPerHr)] : []));
console.log(`| 10 | Battery cost? | median ${drains.length ? drains.sort((a, b) => a - b)[Math.floor(drains.length / 2)] : "—"}%/hr |`);
