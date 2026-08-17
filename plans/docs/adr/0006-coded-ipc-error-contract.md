# Coded IPC error contract

Every IPC handler returns `{ ok: true, data }` or `{ ok: false, error: { code,
message, details? } }`, replacing the shipped `{ ok: false, message }` shape. The
renderer branches on stable machine-readable error codes, never human-readable messages
(guidelines §16). Codes are an additive catalog in `src/shared/contracts/errors.ts`
importable by both processes; domain errors carry a code and `handle()` maps them at the
boundary. Chosen over the current shape because "renderer branches on codes, not
messages" is a mandatory guideline, and over a per-channel ad-hoc error design because a
single shared catalog keeps the contract uniform across modules and lets new modules add
codes without touching the transport layer. This is a breaking change to the IPC shape,
so it lands as part of the foundation refactor before business modules ship.