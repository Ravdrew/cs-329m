# Cal.com component baseline

## View the interactive graph

The standalone [visualization.html](visualization.html) is included in this branch.
After checking out `codegraph-baseline`, open it in a browser. No installation,
Cal.com checkout, database, or local server is needed to view this saved snapshot.
Terminal chat interfaces do not display the interactive graph inline.

From the repository root on macOS:

```bash
open graphs/codegraph-calcom/visualization.html
```

On Linux, use `xdg-open graphs/codegraph-calcom/visualization.html`. On Windows,
double-click the file in File Explorer. GitHub's file page shows its source;
download the file or clone the branch before opening it locally.

- Select a component from the dropdown or click a node to show its direct neighbors.
- The connections table lists incoming/outgoing relationships and supporting file-pair counts.
- Choose **Entire lean graph** to return to the overview.
- Colors identify applications, feature services, shared packages, and tooling.
  Node size represents indexed files; arrows point from dependent to dependency.

The page embeds the current 48-node, 144-edge snapshot. Regenerating the JSON files
below does not automatically update this saved visualization.

## Graph data and regeneration

Generated from CodeGraph 1.6.2 at Cal.com commit
`54343aa685ae8f33159d2f485ec4a57bad5c574a` using the repository's component extension.

- `components.json`: **48 components, 144 edges**, covering 4,481 indexed non-test files.
- `components.full.json`: the same components with **881 aggregated edges** before lean-view pruning.
- `components.report.json`: coverage, configuration, excluded files, and edge accounting.

The starting CodeGraph index has 61,470 nodes and 145,411 edges across 5,153 files.
The projection excludes 672 test-related files. It groups by package/application
boundaries and promotes large feature, web and API subdirectories to components.
Source files occur in exactly one node. Relationships include calls, navigation,
and uses (imports/types and other structural dependencies); evidence points back
to the source. Four small components have no displayed edge after lean filtering;
consult the full graph before treating them as independent.

Regenerate from the repository root:

```bash
bash scripts/codegraph.sh components work/calcom --out graphs/codegraph-calcom
```

These are inferred component boundaries built from the source index, not the
team's reference graph. Pruned links and unindexed files are explicitly recorded.
The JSON files use the shared component schema and can be loaded by the team's
viewer. See `tools/codegraph/README.md` for the algorithm and configuration.
