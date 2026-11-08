# Technical design

## Summary

A static Next.js application hosted on GitHub Pages. A pure TypeScript domain layer calculates readiness from sample data behind provider ports. There is no server, database or secret.

```text
Next.js static UI
      |  view models only
Application service  (load → snapshot: visitList, visitDetail, composer, escalation)
      |
Domain (pure)  allocation · readiness · alternatives · escalation text
      |
Ports  PlanProvider · CatalogueProvider · UsageProvider · StockProvider · ApprovalProvider · Clock · EscalationMarks
      |
Adapters  generated catalogue JSON · labelled sample JSON · system clock · browser storage
```

## Stack fit

| Choice | Decision | Reason |
|---|---|---|
| UI | Next.js, React, TypeScript | Matches QAntum's stack |
| Hosting | GitHub Pages | **Departure from Vercel.** A static read-only slice needs no server, and the URL needs no account beyond GitHub |
| Database | None | **Departure from Supabase.** Nothing is written remotely in this slice. Iteration 2 introduces it with real need |
| Client | Web, not Flutter | Leaders plan in advance while connected; the mobile app stays focused on operatives. Pages remain usable on a phone |
| Validation | Zod at adapter boundaries | Bad sample data fails loudly at the edge |

Existing QAntum systems stay authoritative. Visits and their priority are owned by the planning system and only read here; "earliest first" projects stock use and does not set task priority. This slice would be a route in the web app or a small sibling app, reading through adapters. No QAntum API is assumed; the ports are our own abstractions.

## Data model

This is the logical model behind the ports, and the contract is `src/domain/types.ts`. It is not a schema this slice creates: plans, stock and approvals belong to source systems, which each adapter maps to these types. The only thing this slice writes is an escalation mark in the browser.

```text
Leader *─* Team 1─* Visit *─1 Site
StockPool 1─* Visit
Visit 1─* Scenario *─1 Solution 1─0..N SolutionProduct *─1 Product
SolutionProduct 1─0..1 UsageRule
StockPool 1─* StockBalance *─1 Product
StockPool 1─* Delivery *─1 Product
Visit 1─* Reservation *─1 Product
Solution 1─* AlternativeApproval *─1 Solution (alternative), *─1 Site
Visit 1─* EscalationMark *─0..1 Product
```

IDs are opaque strings. Dates are calendar dates in the configured time zone, and instants are ISO 8601 timestamps with an offset.

### Catalogue (supplied CSV)

| Entity | Fields | Key | Notes |
|---|---|---|---|
| Solution | `id`, `supplierRef`, `supplier`, `orientation`, `substrate`, `substrateComplete`, `serviceClassification`, `serviceType`, `serviceSize`, `integrity` (minutes or null), `insulation` (minutes or null), `productIds`, `rawProducts` | `id` = Internal Code | `productIds` holds the SolutionProduct relation in order. `rawProducts` keeps the supplied text |
| Product | `id`, `name` | `id` | `id` is a slug of the normalised name, as the CSV has no product ID |

### Plan (planning system)

| Entity | Fields | Key | Notes |
|---|---|---|---|
| Team | `id`, `name` | `id` | |
| Leader | `id`, `name`, `teamIds` | `id` | Stands in for identity. A leader can lead several teams |
| Site | `id`, `name` | `id` | |
| StockPool | `id`, `name` | `id` | Shared by any teams whose visits draw on it |
| Visit | `id`, `siteId`, `teamId`, `stockPoolId`, `plannedDate` | `id` | Read only. Its priority belongs to the planning system |
| Scenario | `id`, `visitId`, `solutionId`, `penetrations`, `location` | `id` | One nominated solution and its penetration count |

### Usage, stock and approvals (other sources)

| Entity | Fields | Key | Notes |
|---|---|---|---|
| UsageRule | `solutionId`, `productId`, `perPenetration`, `unit` | `solutionId` + `productId` | On the SolutionProduct pair, as one product is used differently by different solutions |
| StockBalance | `stockPoolId`, `productId`, `quantity`, `unit`, `asOf` | `stockPoolId` + `productId` | `asOf` drives the 24-hour staleness rule |
| Delivery | `id`, `stockPoolId`, `productId`, `quantity`, `expectedDate`, `confirmed` | `id` | Quantity in the stock unit |
| Reservation | `visitId`, `stockPoolId`, `productId`, `quantity` | none | Several rows for one visit and product are summed |
| AlternativeApproval | `id`, `solutionId`, `alternativeSolutionId`, `siteId`, `approver`, `evidenceRef`, `validUntil` | `id` | Counts only for its site and until `validUntil` |

### Written by this slice

| Entity | Fields | Key | Notes |
|---|---|---|---|
| EscalationMark | `visitId`, `productId` (null for a visit-level problem), `markedAt`, `request` | `visitId` + `productId` | Browser `localStorage` only. Iteration 2 replaces it with a tracked record keyed the same way |

Solution, SolutionProduct and Product come from the CSV. Everything else is sample data. Readiness, allocations, shortages and alternatives are **derived on every read and never stored**, so a plan change cannot leave a stale result. See [data notes](05-data-notes.md).

## Allocation algorithm

For each stock pool and product:

1. Stock with a stale or missing balance is marked unknown, and every line for that product needs data review.
2. Subtract all reservations from on-hand stock. Each visit's reservation first covers its own demand. If reservations exceed the balance, every line for that product needs data review.
3. Group remaining visit demand by date and walk the dates in ascending order.
4. For each date, confirmed deliveries expected at least `deliveryLeadDays` before it (default 1) join the inbound balance. A delivery already past its expected date is ignored, as it may be in stock already.
5. If a date's group fits within supply, consume stock first, then inbound. Stock-only cover is `Ready`. If the group needs inbound, every visit in it is `Depends on delivery`, so ID order cannot decide who relies on the delivery.
6. If a one-visit group exceeds supply, consume what remains and report `Short`.
7. If a multi-visit group exceeds supply, report `Stock conflict` for each visit, with the group's total and shortfall. Supply left for later dates is zero.
8. If another visit's demand is unknown on this or an earlier date, a covered result becomes `Needs data review`, as that visit may use the stock first. A known shortage stays `Short`.

Dates are compared in a configured time zone. Worked example: stock 20, needs 15 and 15 gives Ready then Short by 10 on different dates, and a conflict with shortfall 10 on one date.

The ordering rule sits in a single function, as "earliest first" is an assumption that may change.

### Trade-off: all-team data in the browser

Calculation needs every team's plan, and a static site ships that to every viewer. This is acceptable for sample data but **not for production**. There, the same domain code runs on the server, which returns only the viewer's permitted view. Keeping the domain pure makes this a move, not a rewrite.

## Freshness

Readiness is calculated when data is read, so source systems do not need to notify this application.

| Stage | Trigger | Data freshness |
|---|---|---|
| This slice | Page load | Sample data, fixed at build |
| Production read view | Page load, focus or manual refresh | Current source data, with each stock timestamp shown |
| Proactive alerts (later) | A source event or a scheduled check | Thin event says what changed, then the service reads the sources again |

Events are needed only to warn someone who is not looking at the page, or to invalidate a cache if source reads prove slow. No event interface is defined now: the source systems' capabilities are unknown, and this slice does not need one. Any later handler must tolerate duplicate and out-of-order events, which is why an event would prompt a fresh read rather than carry the new state.

## Alternatives

A catalogue match is a lead, not evidence. Two records can match on all technical fields and still differ: solutions 707 and 708 come from one report, match on every technical field, and list different products.

- **Solution level only.** Fire-stopping is tested as a system, so individual products are never swapped.
- **Catalogue candidate:** exact match on orientation, substrate, service type, size, integrity and insulation, with complete substrate detail and a different product list. It is labelled not approved.
- **Approved (sample):** requires a record of site, approver, evidence reference and expiry.
- **Stock check:** the alternative's complete product list is checked against supply left after allocation, across all later visits. Only extra use counts for a product the original already uses, and a product that is short on this visit never qualifies.

In production, a qualified person would confirm the evidence covers the actual substrate, service, configuration and rating, and the approval would be scoped to the site. Installing an alternative must also connect with QAntum's variation flagging. A team leader can request this review but cannot grant it.

## User experience

- **Two sections:** the page opens with *Today*, its main heading, as a leader often needs today's picture first; with none today, it shows the next day with visits. A separate *Next 14 days* section then states its own answer ("4 of 8 visits need action") and holds every period figure, chart and the calendar, so no figure sits under the wrong heading. Stat tiles and the state legend double as filters, so no visual is decorative. On a phone, the breakdown and materials to chase fold behind a button, so the visits come first.
- **Charts:** a segmented bar shows the mix of states. It suits one whole split into a few parts, and it reads faster than a donut. Materials to chase use *share of demand short*, as raw shortages cannot be compared across units.
- **Calendar:** the default view, as leaders plan by day. Weekends stay hidden unless a visit falls on one or today is a weekend day, and phones get a day-by-day agenda because seven columns do not fit. The list remains available.
- **Visit detail:** the decision comes first. On wide screens the evidence sits beside a sticky escalation panel, so a leader can check the facts while writing the request.
- **Escalation:** the leader chooses a request and products, previews the text, then copies it to send through their usual channel.
- **Failure states:** loading, no visits in the horizon, no filter matches, failed data load, and stale data each have their own message and next step.
- **Clarity:** states use text and an icon as well as colour, and a sample-data banner is always visible.

Choosing a sample leader replaces sign-in, and it lets a reviewer see both sides of a conflict.

## Escalation

Escalation is per product, because a shortage belongs to a product and different problems go to different people: purchasing for supply, logistics for a delivery, a fire engineer for an alternative.

- **Items:** each product with a problem on a visit is one item, keyed `visitId|productId`. A problem with the visit itself, such as an unknown solution, is one item with no product.
- **Requests:** each item allows only the requests that fit its state. The composer offers the union and preselects the items that fit the chosen request.
- **Message:** `buildEscalation` is a pure function from the selected items and the request to plain text. It opens with one specific ask per item, then the evidence per visit, so its output can be tested exactly and always matches the screen.
- **Two entry points, one model:** the visit page escalates that visit's products, and the product page escalates one product across the leader's visits.
- **Marks:** each mark records the item, time and request in `localStorage` on that device, wrapped for failure. The application layer derives visit status (escalated or partly escalated) and drops marks for problems that no longer exist.

Iteration 2 replaces marks with tracked records, and the same item keys become their identity.

## Delivery

GitHub Actions runs on each pull request and each push to `main`:

```text
install → lint → typecheck → unit and integration tests → catalogue drift check → build → Playwright and axe → deploy to GitHub Pages → smoke test the public URL
```

Deployment runs from `main` only, and Actions run history provides the deployment evidence. The repository and its Pages site must be public.

## What works where

| Capability | Deployed exercise | Production would need |
|---|---|---|
| Solutions and products | Real supplied excerpt | Live specification source |
| Plan, usage, stock, deliveries | Labelled sample data | Authoritative integrations and defined semantics |
| Identity | Sample leader selector | Authentication and team-scoped authorisation |
| Calculation | In the browser | Server-side, returning scoped results |
| Escalation | Copy to send; mark kept per browser | Tracked record, ownership, audit trail |
| Stock certainty | Projection only | Reservations and concurrency control |

## Main trade-offs

| Choice | Gain | Cost |
|---|---|---|
| Static, read-only | Simple, robust, no secrets, nothing to abuse | Shows no server, auth or write path; tracking is untested |
| Generated message over a queue | Real and honest, with little code | No status or ownership until iteration 2 |
| Six states | Honest about delivery, conflict and data risk | More for leaders to learn; needs user validation |
| Derived readiness | Cannot go stale | Costs more at real scale; may need caching |
