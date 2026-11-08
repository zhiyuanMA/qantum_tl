# First-slice specification: visit readiness check and shortage escalation

## Goal

A team leader can see, for their upcoming visits, whether materials are available, why not, and send a precise escalation to the business.

## Definitions

| Term | Meaning |
|---|---|
| Visit | A crew's planned attendance at a site on one date |
| Scenario | One nominated solution and a penetration count within a visit |
| Stock pool | A group of stock shared by one or more teams |
| Horizon | The next 14 calendar days, configurable |

## Readiness states

The visit shows the most severe state of its material lines, in this order.

| Severity | State | Rule |
|---|---|---|
| 1 | **Short** | Demand cannot be met by stock or qualifying deliveries, after earlier visits have taken their share |
| 2 | **Stock conflict** | Same-day visits in a pool want more than the available supply, so a person must decide |
| 3 | **Needs data review** | Usage is missing, units differ, or stock is missing or stale |
| 4 | **Depends on delivery** | Covered only by a delivery expected before the visit date |
| 5 | **Ready** | Every product is covered by current stock on the current plan |
| 6 | **No products listed** | All scenarios use solutions with no products in the catalogue |

An approved alternative is an *option* shown on a short visit, not a state. The visit stays short until the nominated solution actually changes.

## Functional requirements

| ID | Requirement |
|---|---|
| FR1 | The viewer selects a sample team leader; the list shows only that leader's teams' planned visits in the horizon |
| FR2 | Calculation includes planned visits from **all teams** drawing on the same stock pool |
| FR3 | Visits sort by planned date, then severity, then visit ID |
| FR4 | The list shows date, site, team, state, and a one-line reason |
| FR5 | The list filters by state and shows a count per state |
| FR6 | Visit detail states the visit's result, and names any product with a less severe problem, such as one that depends on delivery on a short visit. It lists scenarios, their solutions and which are affected by a shortage |
| FR7 | Each material line shows required, reserved, allocated stock, inbound, shortage, unit and stock timestamp |
| FR8 | Detail names any other team's visit that takes stock from this visit |
| FR9 | Allocation applies existing reservations first, then the remaining supply by planned date |
| FR10 | A delivery counts only if confirmed and expected at least the configured lead time before the visit date (default one day) |
| FR11 | Same-day contention is reported as a conflict and is never resolved by ID order |
| FR12 | Detail lists alternatives, separating *approved (sample)* from *catalogue candidate: not approved* |
| FR13 | Escalation works per product. For any visit with a problem, the leader picks a request, and only the products that request fits are offered: expedite supply for a shortage or conflict, confirm priority for a conflict, confirm delivery for a product that depends on one, review an alternative where one exists, and correct the data for a data problem. Products are selected by default and can be unchecked |
| FR14 | The message opens with one specific ask per selected product, then gives each visit's site, date, team, status, other risks, the selected products with stock timestamp, takers and deliveries, and the affected scenarios. It can be copied to send through the leader's usual channel |
| FR15 | After sending, the leader marks the selected products as escalated. Each mark records time and request, shows on its material and can be removed. A visit shows as escalated when every current problem is marked, and partly escalated otherwise. Marks are kept only on that device and are ignored once the problem is gone. Fully escalated visits still count as needing action, but are skipped for "act on next" |
| FR16 | Every screen states that data is sample data |
| FR17 | The dashboard leads with counts of visits needing action, to keep an eye on, and ready, plus the next visit needing action. Each visit is in one group. No products listed is not counted as ready |
| FR18 | The dashboard shows the mix of states, and the materials to chase, soonest first, with the share of the leader's demand that is short |
| FR19 | Visits appear on a calendar by default, with a list as an alternative. On a phone the calendar becomes a day-by-day agenda. Weekends appear only when a visit falls on one or today is a weekend day, so today is always shown |
| FR20 | Counts and states filter both views. Selecting an active filter clears it |
| FR23 | The dashboard shows today's visits first, most severe first, with a one-line summary. With none today, it shows the next day with visits |
| FR22 | From the materials to chase, the leader can escalate one product across all their affected visits in one message |
| FR21 | Each material shows a bar of how its required quantity is covered, with no bar when the quantity is unknown |

## Acceptance criteria

| ID | Given | When | Then |
|---|---|---|---|
| AC1 | Stock of 20; Team North needs 15 on Tuesday; Team South needs 15 on Thursday | Each leader opens their visit | North is Ready; South is Short by 10 and names the North visit |
| AC2 | The same stock and demand, both visits on one day | Either leader opens theirs | Both show Stock conflict: 30 needed, 20 available; neither shows Ready |
| AC3 | North has reserved 15 | South opens its visit | South is Short by 10 and the 15 is shown as reserved for North |
| AC4 | A visit has 4 products and one is short | Detail opens | The visit is Short; all 4 lines are shown |
| AC5 | A shortage has a confirmed delivery due the day before the visit | Detail opens | The visit is Depends on delivery and shows the date |
| AC6 | The delivery is due on the visit date, or is unconfirmed | Detail opens | The visit is Short |
| AC7 | Stock is older than 24 hours, or absent | Detail opens | Needs data review; never Ready |
| AC8 | A known shortage and a stale line on one visit | Detail opens | Short, and the data warning also shows |
| AC9 | A solution's product has no usage rule, or units differ | Detail opens | Needs data review; no quantity is invented |
| AC10 | A scenario's solution has zero products | Detail opens | It reads "No products listed in catalogue", is not an error, and adds no demand |
| AC11 | Two catalogue solutions match on technical fields, with no approval record | Detail opens | Shown as a candidate, not approved, and the visit state is unchanged |
| AC12 | A short visit | The leader generates an escalation | The text contains the FR14 facts and matches the screen |
| AC13 | Browser storage is unavailable | The leader marks a visit escalated | The page still works, shows the mark for this session, and explains it will be lost on reload |
| AC15 | A leader has visits in several states | The dashboard opens | Each visit is counted once, and the next visit needing action is one click away |
| AC16 | Visits fall across the horizon, including a weekend | The calendar opens | Every visit appears on its day, and leads to its detail |
| AC17 | A count is selected | The leader switches between calendar and list | Both show only matching visits, and selecting it again clears the filter |
| AC18 | A visit is short of one product and depends on a delivery for another | The leader escalates the shortage, then confirms the delivery | The visit is partly escalated after the first, escalated after the second, and "act on next" moves on only then |
| AC19 | A product is short on two of the leader's visits | They escalate it from the materials to chase | One message asks for both, and marking covers both visits |
| AC20 | The delivery lead time is two days | A delivery is due the day before the visit | It does not count |
| AC21 | Each request | The leader picks it | The message asks for something specific: the quantity and date to expedite, the competing visits to prioritise, the delivery to confirm, each alternative with its approval and stock, or the data to correct |
| AC22 | A leader has visits today | The dashboard opens | Today's visits and their states are visible without scrolling. With none today, the next day's visits are shown |
| AC14 | A narrow phone-width screen or keyboard-only use | The core flow is used | It is usable with no horizontal page scroll, and states are not conveyed by colour alone |

## Non-functional requirements

- **Correctness over completeness:** uncertain data never produces Ready.
- **Accessibility:** target WCAG 2.2 AA; automated checks in CI.
- **Performance:** the list recalculates in under 100 ms for the sample data; the page is static and cacheable.
- **Reliability:** no runtime service dependency; the public URL needs no maintenance to stay up.
- **Security:** no secrets, no user input stored remotely, and no real personal or stock data.
- **Reproducibility:** tests inject a clock. Sample dates are business-day offsets from today, so the public demo never goes stale.

## Assumptions

- Quantities, stock, deliveries, reservations, sites, teams, visits and alternative approvals are **sample data**.
- Earlier planned visits take stock first. This is our assumption, isolated in one function.
- The sample uses one shared pool to show contention, and a second pool to show independence.
- All listed products for a solution are mandatory.
- Materials are rounded up to whole stock units per visit, as part packs can be shared within a visit.
- A zero-product solution has no material demand, but this is not confirmed, so the UI repeats only what the catalogue shows.

## Exclusions

Authentication, persistence, reservations, approval workflow, stock edits, creating, changing or prioritising visits (the planning system owns these), real notifications, crew capacity, skills, offline use and administration of any source data.
