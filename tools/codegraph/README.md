# CodeGraph baseline

This branch uses [colbymchenry/codegraph](https://github.com/colbymchenry/codegraph),
pinned to version **1.6.2** in `package.json` and `package-lock.json`.
The CLI is installed locally; `node_modules/` is ignored by Git.

From the repository root:

```bash
npm ci --prefix tools/codegraph
bash scripts/codegraph.sh --version
bash scripts/codegraph.sh --help
```

To build a graph after setting up the target checkout:

```bash
# Requires Node 20; installs Cal.com's dependencies as well as cloning it.
bash scripts/setup_calcom.sh
bash scripts/codegraph.sh init work/calcom
bash scripts/codegraph.sh status work/calcom
```

The inherited setup pins `calcom/cal.com` to `54343aa685ae8f33159d2f485ec4a57bad5c574a`.
The viewer/scorer branch's sample graph instead targets `calcom/cal.diy` at
`6bfe2df9d13c456dc9374c9e6581b36fba188728`; align the target repository and commit
before comparing baseline graphs.

Installing the CLI does not clone or index Cal.com, configure agent MCP servers,
or convert CodeGraph output to the shared conceptual graph schema.

## Component-level graph extension

The repository launcher now adds a `components` command to CodeGraph. This is a
local coarsening stage over its SQLite index, not a patch inside `node_modules`
or a fork of the upstream parser. It requires Python 3.9+ and no Python packages.

```bash
bash scripts/codegraph.sh components work/calcom --out graphs/codegraph-calcom
# Optional controls:
bash scripts/codegraph.sh components work/calcom --components 40 \
  --top-dependencies 2 --out /tmp/calcom-components
python3 -m unittest discover -s tools/codegraph -p 'test_*.py' -v
```

`components.config.json` defines the target size (48), directory split candidates,
confidence cutoff, and edge filtering. Base nodes correspond to applications and
packages. The largest eligible directories under the configured split roots get
separate nodes until the budget is filled. Every indexed non-test file belongs
to exactly one component. Parent nodes contain the remaining files, not their
child components' files. These are inferred architectural boundaries, not a
hand-authored reference or an LLM's interpretation of business responsibilities.

The source database is opened read-only in a consistent transaction. The builder
requires a complete index at the current Git commit and a clean tracked checkout.
Output has stable ordering and no timestamps, so repeated builds are reproducible.

### Edges and output

- Drops containment, within-component relationships, test-file relationships,
  and explicit confidence below 0.8. Missing confidence is retained and counted.
- Preserves `calls` and `navigates`; maps imports, type references, instantiation,
  inheritance, implementation and decorators to `uses`. It does not invent
  `reads`/`writes`, business workflows, or external-service nodes.
- Aggregates directed edges by source component, target component and kind.
  Weights count distinct source/target file pairs; repeated call sites do not
  inflate that weight. Raw edge counts and original kinds remain in `x-codegraph`.
- Attaches up to three source evidence locations per aggregated edge.
- The lean view requires two supporting file pairs, retains the strongest three
  outgoing edges per component, and also retains each target's strongest eligible
  incoming edge. This can leave small or weakly connected components isolated.

Outputs:

| File | Purpose |
| --- | --- |
| `components.json` | Lean graph for exploration |
| `components.full.json` | All aggregated edges after the documented source/confidence filters; use for completeness-sensitive evaluation |
| `components.report.json` | Configuration, commit, coverage, exclusions, edge accounting and limitations |

Both graphs conform to `schema/graph.schema.json`, copied unchanged from the
`viewer` branch. No sample/reference graph or scorer answer key is used. The
schema permits the `x-codegraph` extension containing weights and provenance.
Candidate graphs can be loaded in the team's viewer or supplied to its scorer
after agreeing on the same target repository and commit as the evaluation.

Only indexed files are represented. In particular, unsupported sources such as
Prisma schemas and SQL migrations may be absent; the report lists every tracked
file missing from the index. This is a structural baseline, not a complete
semantic architecture reconstruction.
