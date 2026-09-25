# ADR 0004 — No backend; €2.99 as a paid app, not IAP

## Status

Accepted — 2026-09-25

## Context

Siesta is €2.99, one-time. The brief prefers no backend and no accounts.

## Decision

Distribute as a **paid app** on both stores (App Store / Play price tier)
rather than free + IAP.

## Rationale

- Zero purchase code, zero receipt validation, zero backend.
- A nap timer needs nothing a server provides: detection is on-device, state is
  on-device, privacy story stays airtight ("your sleep never leaves your
  wrist").
- Companion "free + paid unlock" would add StoreKit/Play Billing surface area
  for no product benefit at this price point.

## Consequences

- No trial/refund logic to build (stores handle refunds).
- siesta.app is purely marketing — Astro static site, no server.
- If a future feature (e.g. sync) ever needs a backend, it is opt-in and
  isolated behind an API — never required for the core flow.
