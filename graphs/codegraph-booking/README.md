# Booking-scoped CodeGraph baseline

For the automated **CodeGraph → Pi/Astra grouping → static edge aggregation**
variant, see [the separate runner](../../tools/codegraph-llm/README.md). It reuses
this structural scope but discards these component assignments before calling
Astra. The saved graphs described here remain the deterministic baseline.

Built against **calcom/cal.com at `54343aa685ae8f33159d2f485ec4a57bad5c574a`**,
matching the pinned Cal.com setup and the whole-repository baseline. This booking
baseline is derived from a CodeGraph 1.6.2 index. The whole-repository graph remains
separate in `graphs/codegraph-calcom/`. The viewer's original sample graphs target
the different commit `6bfe2df9`; those samples are unchanged.

## Two stages

1. **Structural graph:** index the source checkout with CodeGraph, then retain the
   non-test files inside the declared booking boundary. The full repository index
   contains **61,470 nodes / 145,411 edges across 5,153 indexed files**. Its
   booking-scoped induced subgraph contains **11,525 nodes / 20,363 edges across
   740 files**, including containment, import, call and reference edges.
2. **Component projection:** map those files to **32 components**, aggregate
   extracted dependencies, and reduce the displayed connections to **79 edges**.
   The companion full component graph has **298 edges** after confidence and
   within-component filtering, before lean pruning.

The raw index is at `work/calcom/.codegraph/codegraph.db`. The scoped raw
export is `work/calcom-booking-structural.json`; it retains structural node IDs,
edges, source locations and a file-to-component mapping. Both are gitignored.
The report records the raw export's SHA-256 for reproducibility.

## Scope and method

`tools/codegraph/booking.config.json` declares the scope and component path rules.
It covers the public booking UI, booking management, web HTTP/tRPC APIs,
availability, booking lifecycle, repositories, audit, calendars, payments,
notifications and webhook support. Shared supporting packages include all their
indexed non-test files, not just booking-exclusive code. API v2, generic UI/auth
utilities and provider-specific app-store implementations are outside scope.

Component boundaries are **manually configured source-path rules**; this is not
automatic semantic clustering or an LLM-generated graph. A file belongs to the
longest matching literal prefix, so more specific components override shared
fallback components. Every included file has exactly one owner. Bracketed route
segments are treated literally. Rules and labels were constructed from the source
layout; the viewer's sample graph is not an input to the pipeline.

Connections come only from the CodeGraph index: `calls` and `navigates` retain
their types; imports and other structural dependencies become `uses`. There are
no invented database read/write edges, inferred workflows, or placeholder edges
for dependencies outside the scope. Explicit confidence below 0.8 is filtered;
missing confidence is retained and counted. Up to three evidence sites accompany
each aggregated edge.

The lean graph keeps the two strongest outgoing dependencies per component and
each component's strongest incoming dependency, weighted by distinct file pairs.
One supporting file pair is sufficient here because some booking services are
single-file components. No components are isolated after pruning.

## Outputs

| File | Purpose |
| --- | --- |
| `components.json` | Shared-schema lean graph: 32 nodes / 79 edges |
| `components.full.json` | Same nodes with all 298 aggregated dependencies |
| `components.report.json` | Configuration, scope, coverage, exclusions and raw export fingerprint |

Both graph files follow `schema/graph.schema.json`, contain no layout positions,
and use `x-codegraph` for transformation metadata. They can be loaded in the team
viewer or scored after agreeing on the evaluation boundary. The full component
graph is preferable when evaluating dependency completeness.

**Limits:** matching the commit does not guarantee the same evaluation scope as
another graph. Dependencies crossing this boundary are counted in the report but
not drawn. CodeGraph does not extract Prisma model definitions from the schema;
the report lists unindexed files inside the scope. Database-client components
therefore do not stand in for individually modeled database tables.

## Reproduce

From the repository root (Git, Python 3.9+, and npm required):

```bash
npm ci --prefix tools/codegraph
bash scripts/build_booking_graph.sh
```

This uses the pinned `work/calcom` checkout and does not install Cal.com's app dependencies.
To regenerate only the projection from the existing index:

```bash
bash scripts/codegraph.sh components work/calcom \
  --config tools/codegraph/booking.config.json \
  --raw-out work/calcom-booking-structural.json \
  --out graphs/codegraph-booking
cp graphs/codegraph-booking/components.json viewer/public/graphs/codegraph-booking-components.json
```

## View

```bash
npm ci --prefix viewer
npm run dev --prefix viewer
```

Open http://localhost:5173/?graph=/graphs/codegraph-booking-components.json
(use Vite's printed port if it differs). Use **Open…** to inspect
`graphs/codegraph-booking/components.full.json` instead.

Validate either file:

```bash
node viewer/scripts/validate.mjs graphs/codegraph-booking/components.json graphs/codegraph-booking/components.full.json
python3 -m unittest discover -s tools/codegraph -p 'test_*.py' -v
```
