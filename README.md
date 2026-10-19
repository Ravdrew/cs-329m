# Graphical Representations of Codebases for Intent Legibility

CS 329M (Machine Programming) project, Fall 2026: Andres Garcia, Nathan Cho, Renaldo Venegas, Joseph Bailey.

We build a component-level graph of a real TypeScript app (starting with [Cal.com](https://github.com/calcom/cal.com)), let developers express intent by editing the graph, and measure whether that helps coding agents and people compared with prose alone.

## Workflow

Open a pull request for changes; don't push directly to `master`.

| `docs/benchmark-pr-audit.md` | **PR audit**: how the SWE-bench-style tasks were mined and verified, the recommended 20, caveats |
| `benchmark/tasks.json` | 37 verified fail-to-pass task instances (base/merge commit, test files, FAIL_TO_PASS / PASS_TO_PASS ids, test command) |
| `benchmark/scripts/` | Mining, filtering and verification scripts (`benchmark/README.md` has the commands) |
| `docs/screenshots/` | Viewer screenshots for reports |
