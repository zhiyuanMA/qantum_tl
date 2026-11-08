# Agent guide: QAntum team leader readiness

Read this before changing anything. `CLAUDE.md` imports this file, so keep one set of instructions here.

Sources of truth, in order:

1. [First-slice specification](docs/02-first-slice-spec.md): what to build, with requirement and acceptance IDs
2. [Technical design](docs/03-technical-design.md): architecture and the allocation algorithm
3. [Test strategy](docs/04-test-strategy.md): what must be tested, and where
4. [Data notes](docs/05-data-notes.md): catalogue findings and sample data rules
5. [Iteration plan](docs/01-iteration-plan.md): what is deliberately left for later

If code and these documents disagree, stop and find out which is wrong. Do not change a requirement to fit the code.

## What this is

A take-home exercise for QAntum, a passive fire compliance platform. A team leader checks whether upcoming site visits have the materials they need, understands any shortage, and generates an escalation. It is a read-only static web app. No QAntum code, schema or API was supplied.

## Working rules

1. **Stay in scope.** Build what the specification asks. Record useful ideas for later in the iteration plan rather than building them.
2. **Ask before changing direction.** Stop and ask before changing readiness states, acceptance criteria, scope, the stack or the hosting approach, or before adding a production dependency.
3. **Do not invent integrations.** Never present a QAntum API, schema or system behaviour as real. Ports are our own abstractions.
4. **Keep small.** Make focused changes that match surrounding code. Add no speculative abstractions, and nothing for iteration 2 onwards.
5. **Keep docs in step.** When behaviour changes, update the affected document in the same change.
6. **Record corrections.** When the developer corrects or rejects agent work, or a review finds a real defect, add one line to `docs/06-agentic-approach.md`: what was proposed, what changed, and why.

## Git and publishing

- Commit, push or create pull requests only when the developer asks.
- The GitHub account is `zhiyuanMA`. Check `gh auth status` before any remote operation.
- Use one branch per piece of work (`feat/…`, `fix/…`, `docs/…`, `chore/…`) and merge through a pull request, so CI runs.
- Never commit secrets, `.env` files, or real personal or commercial data.
- Deployment happens through GitHub Actions from `main`. Never deploy by hand.

## Commands

Node 22, from `.nvmrc`. It may not be on `PATH` in a non-interactive shell, so load `nvm` first.

```bash
npm ci
npm run dev
npm run catalogue      # regenerate the catalogue from the CSV
npm run lint
npm run typecheck
npm test               # Vitest
npm run test:e2e       # Playwright and axe, against the built site
npm run test:coverage
npm run test:smoke     # requires BASE_URL
npm run build          # static export
npm run check          # everything CI runs before deployment
```

## Architecture rules

```text
src/app, src/components → src/application → src/domain
src/adapters            → src/ports       → src/domain
```

| To change | Look in |
|---|---|
| Allocation, states, alternatives, escalation text | `src/domain/` |
| View models for the UI | `src/application/` |
| Provider interfaces | `src/ports/` |
| JSON loading, clock, browser storage | `src/adapters/` |
| Pages and UI | `src/app/`, `src/components/` |
| Catalogue generation | `scripts/`, `data/source/` |
| Labelled sample data | `data/sample/` |
| Generated catalogue (never edit by hand) | `data/generated/` |
| End-to-end tests | `tests/e2e/` |

- `src/domain` is pure: no React, Next.js, adapters, `Date.now()` or browser APIs. Time comes in as an argument.
- UI components render view models. They must not calculate readiness, urgency, allocation or shortages.
- Enforce these boundaries with lint rules where possible.
- The site is a static export. Do not add route handlers, server actions or anything needing a runtime server.
- Calculate date-dependent output on the client, or the build date will be baked in and hydration will mismatch.
- Validate external data with Zod at the adapter boundary. Do not use `any`.

## Domain rules

These protect the product's main promise. Breaking one is a defect, even if tests pass.

- **Never produce a false Ready.** Missing, stale or incompatible data gives Needs data review.
- **Calculate across all teams in a stock pool**, then scope the view to the selected leader.
- **Resolve same-day contention by a person.** Never use ID or input order to pick a winner.
- **Do not store readiness.** Derive it on every read.
- **Ready is a projection**, not a guarantee, unless stock is reserved. UI wording must say so.
- **Never infer products or quantities** from names, sizes, ratings or similar records.
- **Substitute whole solutions only.** Never swap individual products.
- **A catalogue match is not approval.** Only an explicit, scoped, unexpired approval record counts, and it never changes a visit's state.
- **Do not own plans.** Never create, change or prioritise visits. "Earliest first" only projects stock use.
- **Label sample data** in code, documents and on every screen.

## Known data traps

- One product name contains `, `. Split `Products` only on commas not followed by a space. Expect 36 products.
- `0` and blank both mean zero products. Zero products is not an error, and the UI repeats only what the catalogue shows.
- Insulation of `-` means not stated, never 0.
- Product names have irregular spacing. Normalise for IDs, and keep the original.
- Never correct supplied data. Report suspicious rows in the data notes.
- `data/source/` is the unmodified supplied file. Never edit it.

## Testing and verification

- Write domain tests first, and name them with the acceptance ID, such as `AC2: same-day contention`.
- Tests use an injected clock and deterministic data. They never depend on today's date or the network.
- When fixing a bug, add a test that fails without the fix.
- Fix the code, not the test, unless the requirement changed.
- Never skip, weaken or delete a test to get a pass without telling the developer.

## Definition of done

1. The change traces to a requirement or acceptance ID.
2. `npm run check` passes, and you have read the output.
3. For UI changes, you have used the feature in a browser, including its empty and failure states and a phone width.
4. Docs are updated.
5. You report what changed, what you ran and what you did not verify. Do not claim success for anything you did not run.
