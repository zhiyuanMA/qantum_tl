# Iteration plan

## The need

Before going on site, a team leader must know whether the materials for planned work are in stock. If they are not, the leader must tell someone who can act, then decide whether to wait, use a different solution or reschedule the crew. That check needs the nominated solutions, material usage, shared stock, deliveries and other teams' plans. These facts are spread across systems or do not exist as data.

## Sequence

| # | Iteration | Value added | New capability |
|---|---|---|---|
| 1 | **Visit readiness check and shortage escalation** (this slice) | The leader sees which upcoming visits are at risk, why, and what to send to whom | Read-only readiness calculation across all teams sharing a stock pool; generated escalation message |
| 2 | Tracked escalations | Shortages have an owner and a status; nothing is lost in an inbox | Supabase persistence, authentication, supply coordinator queue, notifications |
| 3 | Alternative solution review | A suitability decision is recorded and reusable | Review and approval workflow, evidence links, variation linkage |
| 4 | Live stock and reservations | Readiness reflects real stock, and a leader can hold it | Inventory and delivery integrations, reservation with concurrency control |
| 5 | Readiness in crew planning | Leaders see readiness where they schedule crews | Readiness published to the existing planning system, which keeps ownership of schedules and priority |
| 6 | On-site confirmation | Crews confirm materials before leaving | Flutter offline-first pre-departure checklist |

Each iteration adds value on its own. The order puts cheap steps that build on earlier work before costly integrations, and it should be revisited after observing how leaders use iteration 1.

## Why this first slice

- **Users:** the primary user is a construction project team leader planning the next two weeks. Supply coordinators or operations managers receive the escalation.
- **Value:** a leader finds out days ahead, not at the site, that a visit will be short, and can send a precise request without assembling it by hand.
- **Boundary:** the system decides nothing on the leader's behalf and changes no stock, schedule or specification.

## Why the later iterations, in this order

Each later iteration removes a limit that iteration 1 deliberately leaves.

**2. Tracked escalations**
- **Limit removed:** the message leaves the system. Nobody owns it, the leader cannot see a reply, and the "escalated" mark lives in one browser.
- **Why next:** it reuses iteration 1's escalation items and their keys, and needs only Supabase and authentication, with no outside integration. Authentication also lets calculation move to the server, so a leader receives only their teams' data.
- **Revisit if:** leaders rarely escalate, or replies already arrive reliably through existing channels.

**3. Alternative solution review**
- **Limit removed:** the brief names a different solution as one answer to a shortage. Iteration 1 shows candidates and sample approvals, but a reviewer cannot record a decision, so the same substitution may be reviewed again.
- **Why here:** a review request is a tracked escalation with a different owner, such as a fire engineer, so it builds on iteration 2's records and roles. It needs only specification data, not inventory systems.
- **Builds on:** iteration 2, a qualified reviewer role, and QAntum's variation flagging, so an approved substitution is not later flagged as a variation.
- **Revisit if:** "Review an alternative" requests are rare. Then move it after iteration 4.

**4. Live stock and reservations**
- **Limit removed:** Ready is only a projection, and stock data can be hours old. Two leaders can still plan on the same stock.
- **Why not earlier:** it depends on external inventory and delivery systems whose meaning is still open (uncertainties 1, 2 and 7). It is the costliest and riskiest step, and reserving stock needs a write path with concurrency control.
- **Revisit if:** leaders act on a Ready that proves wrong, or an inventory integration becomes available sooner. Then move it before iteration 3.

**5. Readiness in crew planning**
- **Limit removed:** the brief says leaders need this information to schedule crews, but readiness sits in a separate screen from the schedule.
- **Why here:** putting readiness into the planning system is only worth it once readiness is trustworthy, which iteration 4 provides. The planning system keeps ownership of schedules and priority.
- **Builds on:** iteration 4, and an interface to the existing planning system.

**6. On-site confirmation**
- **Limit removed:** a crew can still leave without an item, which is only found at the van or on site.
- **Why last:** it serves a different user, operatives, and adds the most client work: offline-first Flutter screens and sync. A checklist is most useful when there is a reserved list to pick against, which iteration 4 provides.
- **Builds on:** iteration 4, and the existing offline-first mobile app.

## Important uncertainties

The brief leaves these open. They do not block the exercise, where sample data stands in, but they need answers from QAntum before real integration.

1. Is stock pooled across teams, or held per team, yard or van?
2. Who decides priority when two teams want the same stock?
3. The catalogue has no material quantities, so this slice uses sample values. What is the real source of usage per solution?
4. Does a solution with no listed products truly need none, or is the mapping incomplete?
5. Are all products listed for a solution mandatory, or are some either/or?
6. How is planned work represented today, and how far ahead is it known?
7. How long before a visit must a delivery arrive to be relied on? The slice assumes one day, configurable.
