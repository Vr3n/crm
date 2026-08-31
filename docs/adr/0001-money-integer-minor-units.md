# ADR-0001: Money is integer minor units with an ISO 4217 exponent

## Status

Accepted

## Context

Money was stored as integer minor units, but conversion was hardcoded `100` across ~25 sites. Two live bugs:

1. `toRupees = Math.round(minor / 100)` dropped fractional minor units — `toRupees(24525) === 245` instead of `245.25`.
2. `fromRupees = Math.round(rupees * 100)` hit the float trap — `fromRupees(1.005) === 100` because `1.005 * 100 === 100.49999999999999`.

Additionally, the invoice read model shipped whole-unit floats via `toRupees` while the finance read model shipped integer minor units — a split-brain inconsistency. The renderer's `build.ts` recomputed totals from lines in floats, contradicting the design.

## Decision

Money crosses process boundaries and the read models as an integer count of a currency's
minor units plus that currency code, and is converted to a display string only at the
rendering edge. The minor/major ratio is an ISO 4217 exponent looked up per currency
from a **deliberate common subset** (INR/USD=2, JPY=0, KWD=3); unknown codes throw
(fail-closed, not fallback-to-2). This is not a complete ISO 4217 implementation.

Input parsing rounds excess digits half-even; tax and percentage discounts keep half-up
(legislated for GST/VAT). `formatMinor` feeds an exact decimal string to
`Intl.NumberFormat` — this is a **runtime-tested assumption** pinned to Electron 43 /
Node 25 (V8 + ICU 78), guarded by a near-2⁵³ regression test, not a general JS
guarantee.

This replaces an earlier convention where the invoice read model shipped whole-unit
floats and the renderer recomputed totals.

## Consequences

- All read-model contracts change from `number` to `int` with `*Minor` suffix naming.
- Renderer types change correspondingly; `build.ts` recompute is deleted.
- Currency threading added via `useCurrency()` hook reading `Organization.currency`.
- Tax and percentage discount rounding remain half-up (legislated for GST/VAT per EN 16931 / ATO GST Act).

## Alternatives considered

- **Decimal strings on the wire:** Rejected — adds parsing complexity at every boundary, no type safety.
- **Half-even everywhere:** Rejected — tax rounding must be half-up per legislation.
- **Hardcoded `100`:** Rejected — not all currencies have 2 decimal places.
- **Dinero.js:** Rejected — covers what we need but adds a dependency; `bigint` backend is not IPC-serializable.
