# QAntum team leader readiness

A take-home exercise. A team leader sees at a glance which upcoming site visits need action, why, and generates an escalation to send to the business.

**Everything except the solution catalogue is sample data.** No QAntum system, schema or API was used.

## Documents

| Document | Purpose |
|---|---|
| [Iteration plan](docs/01-iteration-plan.md) | The need, the sequence of iterations, open questions |
| [First-slice specification](docs/02-first-slice-spec.md) | Requirements, acceptance criteria, exclusions |
| [Technical design](docs/03-technical-design.md) | Architecture, allocation, alternatives, trade-offs |
| [Test strategy](docs/04-test-strategy.md) | Layers, risks, traceability |
| [Data notes](docs/05-data-notes.md) | Catalogue findings, mappings, sample data |
| [Agentic approach](docs/06-agentic-approach.md) | Tools, direction, verification, corrections |
| [AGENTS.md](AGENTS.md) | Instructions given to coding agents |

## Run locally

Requires Node 22 (see `.nvmrc`).

```bash
npm ci
npm run dev       # http://localhost:3000
```

## Test

```bash
npx playwright install chromium   # first time only
npm run check                     # lint, types, tests, catalogue drift, build, end-to-end
npm test                          # unit, integration and component tests only
npm run test:coverage             # coverage of domain and application layers
```

## Deploy

GitHub Actions ([ci.yml](.github/workflows/ci.yml)) runs all checks on pull requests. A push to `main` also deploys to GitHub Pages, then smoke tests the public URL. Set **Settings → Pages → Source** to **GitHub Actions** once. The site needs a public repository, no secrets and no other accounts.

## Demonstration

Dates are working-day offsets from today, so the demo stays current. Use **Viewing as** to change leader.

| Step | As | Open | See |
|---|---|---|---|
| 0 | North | Dashboard | Today's visits first, then how many visits need action, the next one to act on, materials to chase, and the calendar. Select a count to filter |
| 1 | North | V-102 | Ready, with a reminder this is a projection |
| 2 | South | V-103 | Short by 10: North's earlier visit takes the shared stock |
| 3 | South | V-103 | Choose a request, copy the message, then mark it as escalated |
| 3a | North | V-111 | Escalate the short strap, then confirm the delivery: partly escalated, then escalated |
| 3b | South | Materials to chase → Escalate SL COLLAR 55mm | One message for both affected visits |
| 4 | North, then South | V-104, V-105 | Same-day conflict: neither is Ready, and a person must decide |
| 5 | South | V-107 | Short, as stock is reserved for North's V-106 |
| 6 | South | V-108 | Depends on delivery, with a Confirm delivery request |
| 7 | North | V-109 | Short, as the delivery is unconfirmed and does not count |
| 8 | North | V-110 | Approved sample alternative with its stock checked; the visit stays Short |
| 9 | South | V-116 | Catalogue candidate, not approved and not enough stock |
| 10 | East | V-112 (today), V-113 | Needs data review: stale stock, then a missing usage rule |
| 11 | East | V-114 | Ready from a separate pool, while Central is out of the same collar |
| 12 | North | V-115 | No products listed in catalogue: not an error |

## Sample data

`data/source/` holds the unmodified supplied CSV, and `data/generated/` is derived from it with `npm run catalogue`. `data/sample/` is invented, and each file says so.

## Known limitations

- No sign-in: the leader selector stands in for identity, and any viewer can see all sample data.
- Calculation runs in the browser. Production must run it on the server, so that a leader receives only permitted data.
- Escalations are not tracked. "Mark as escalated" exists only in one browser.
- Ready is a projection. Nothing reserves stock.
- "Earliest visit first" and "all listed products are mandatory" are unconfirmed assumptions.
- Usage rates exist only for demo scenarios, and they are illustrative, not compliance guidance.
- Product IDs are derived from product names, as the catalogue has none. Renaming a product would change its ID, so production needs a stable ID from the source system.
- Not tested: real integrations, permissions, concurrency, sending messages, or scale beyond sample data.
