# Test strategy

## Principles

The main risk is a false **Ready**: a crew arrives without materials, or a shortage goes unseen. Testing is heaviest where that can happen, in the pure domain layer. Browser tests are few and cover only what lower layers cannot.

## Layers

| Layer | Tool | Covers |
|---|---|---|
| Domain unit | Vitest | Allocation, states, severity, alternatives, escalation text, dates |
| Data pipeline | Vitest | CSV parsing and generated catalogue checks |
| Adapter contract | Vitest + Zod | Each adapter satisfies its port; invalid data is rejected |
| Application | Vitest | View models for each sample scenario, without UI |
| Component | Testing Library | Loading, empty, error, stale and storage-failure states |
| End to end | Playwright + axe | Core journeys on desktop and phone widths; accessibility |
| Post-deploy | Playwright smoke | The public URL loads and shows a known visit |

## High-risk cases

| Risk | Tests |
|---|---|
| Shared stock missed | Other team's earlier demand reduces supply; separate pools do not interact |
| Stale result | Assessing a changed plan input gives a new result, with no state kept between calls |
| False priority | Same-day contention always conflicts, regardless of input order |
| Over-counted supply | A reservation covers only its own visit; a delivery is not consumed twice |
| Delivery boundary | Day before counts; same day and unconfirmed do not |
| False Ready from bad data | Missing usage, unit mismatch, absent stock, and stale stock at exactly and just past 24 hours |
| Masked problem | Short beats data review, but the warning remains |
| Quantity errors | Round up per visit, not per scenario; zero; exact match gives no shortage |
| Unsafe substitution | Candidates never change state; expired, wrong-site or understocked approvals are not offered as usable |
| Catalogue parsing | 148 rows; 36 products; comma in the brush-grade name; `0` and blank both give zero products; distribution 0:4, 1:8, 2:57, 3:54, 4:23, 5:2 |
| Date faults | Time-zone day boundary, month end, business-day offsets |
| Misleading overview | Each visit in one group; no products listed never counted as ready; a shared conflict shortage counted once; shares capped at 100%; weekend visits never hidden |

A property-based test checks allocation invariants on random plans: allocated never exceeds supply, and results do not depend on input order.

## Acceptance traceability

Tests carry the acceptance ID in their name, such as `AC2: same-day contention`.

| Acceptance criteria | Main layer |
|---|---|
| AC1 to AC9, AC11 | Domain, with AC1, AC2 and AC4 also end to end |
| AC10 | Application and end to end |
| AC12 | Domain and end to end |
| AC13 | Adapter and component |
| AC14 | End to end with axe, plus a manual keyboard pass |
| AC15 to AC22 | Domain, application and component, plus end to end for AC15 to AC17, AC19 and AC22 |

## Not covered

- Real integrations, permissions and concurrency, as none exist in this slice.
- Sending the message: the leader copies it into their own channel.
- Accessibility beyond automated rules and one manual pass.
- Scale beyond the sample data.
- Whether the sample usage rates or the alternative approvals are technically right. They are illustrative, not compliance guidance.

## In CI

All layers run on every pull request and push, using a fixed clock and deterministic data. Any failure stops deployment. Coverage is a guide rather than a gate, with a target of 95% on `domain/`.
