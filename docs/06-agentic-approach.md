# Agentic approach

## Tools

- **Claude Code** did the data profiling, documents, implementation, tests and browser checks.
- **AGENTS.md** gives coding agents their scope, boundaries, domain rules and definition of done.

## How the work was directed

1. Analyse the brief, the data and the developer's early proposal before designing anything.
2. Agree the slice and write the iteration plan, specification, design and test strategy.
3. Review those documents with a person, one decision at a time.
4. Build test first: catalogue parser, then domain, adapters, application and UI.
5. Verify by running everything and using the app in a browser.

## How outputs were verified

- The CSV was profiled by script, and those figures became tests.
- Acceptance IDs link the specification to named tests.
- Property-based tests check allocation invariants on random plans.
- The built site was reviewed in a browser at desktop and phone widths.

## Corrections and rejected suggestions

Rows marked *Early proposal* come from the developer's own early proposal, revised during analysis. Rows marked *Agent* come from coding agents.

| Proposed | Changed to | Why |
|---|---|---|
| Early proposal: assess each task's shortage on its own | Allocate across every visit in a stock pool | Two tasks could each look covered by the same stock. Mastic is in 134 of 148 solutions |
| Early proposal: swap individual products | Solution-level alternatives only | Fire stopping is tested as a system, and the brief refers to a different solution |
| Early proposal: a daily task board sorted by due date | Upcoming visits sorted by planned date | The brief's trigger is checking before going on site |
| Early proposal: read-only, with escalation much later | Escalation in the first slice | The brief names escalation, and the leader needs an action |
| Agent: Supabase table for escalations | A generated message, with no backend | Developer challenge: the slice is otherwise read-only, and a real message beats a fake queue |
| Agent: allocation in date order, with ID as tie-break | Same-day contention is a conflict for a person | Developer challenge on multiple team leads: an ID must not decide who gets stock |
| Agent: acceptance test that removes a visit | Removed; retained as a domain test | Developer challenge: plans belong to the existing planning system |
| Agent: rescheduling in iteration 5 | Readiness supplied to the planning system | The same ownership boundary |
| Agent: usage held on Product | Usage held on SolutionProduct | One product is used differently by different solutions |
| Agent: listed usage as an uncertainty we introduced | Sample data the brief asks for; the real source stays an open question | Developer correction |
| Agent: plain visit list | Stat tiles, charts and a calendar | Developer feedback: leaders need the picture at a glance |
| Agent: "mark as escalated" showed one line of text | The mark appears on the dashboard, calendar and detail, moves "act on next" on, and can be removed | Developer feedback: the action changed nothing a leader could see |
| Agent: one escalation per visit, with a request label that changed one line | Escalation per product, with a specific ask per request and only the requests that fit | Developer review: every request produced the same message, and different problems go to different people |
| Agent: a message listing only the visit's state | Products with other problems, such as one depending on delivery, named as other risks | Developer review: a delivery risk was hidden behind a shortage |
| Agent: dashboard covering the next 14 days only, then a Today panel placed between the 14-day heading and its figures | Today first, then a separate Next 14 days section | Developer feedback: leaders often care most about today, which needed scrolling to find |
| Agent: `Alternative available` as a readiness state | An option on a short visit | The visit is still short until the nominated solution changes |

## Defects found by verification

- A test caught unknown demand hiding a known shortage: Short was downgraded to Needs data review.
- Reviewing a page in a browser found awkward status wording and unreadable UTC timestamps in escalation messages, which tests had not caught.
- Reviewing the first dashboard with sample data found a chart with no information: every material bar was the same length. Bars by visit count were replaced by share of demand short.
- Several tests were wrong rather than the code, and each was checked by hand before being changed: a time-zone calculation, a filter count, two date expectations under the fixed test clock, and selectors that became ambiguous once a visit appeared in both the Today panel and the calendar.
