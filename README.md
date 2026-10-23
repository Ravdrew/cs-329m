# Graphical Representations of Codebases for Intent Legibility

CS 329M (Machine Programming) project, Fall 2026: Andres Garcia, Nathan Cho, Renaldo Venegas, Joseph Bailey.

We build a component-level graph of a real TypeScript app (starting with [Cal.com](https://github.com/calcom/cal.com)), let developers express intent by editing the graph, and measure whether that helps coding agents and people compared with prose alone.

## Workflow

Open a pull request for changes; don't push directly to `master`.

## Layout

| Path | What |
|---|---|
| `viewer/` | React graph viewer with editing (`cd viewer && npm install && npm run dev`); see `viewer/README.md` |
| `viewer/public/graphs/` | Sample graphs: the Cal.com booking subsystem (34 nodes / 50 edges) and a developer-edit variant |
| `schema/graph.schema.json` | JSON Schema for the graph file format (`cd viewer && npm run validate`) |
| `scoring/` | Q1 scorer: compares candidate graphs with a reference graph; see `scoring/README.md` |

## Scoring (Q1)

`scoring/score_graph.py` scores candidate graphs against a reference graph: node and edge recall and precision,
file grouping, has/does-not-have questions, file localization for benchmark tasks, and coherence and citation checks.
Definitions and commands are in `scoring/README.md`; tests run with `python3 -m pytest scoring/tests -q`.
The reference graph and everything scored against it are answer-key material: keep them, and the `--out-dir`,
outside this repo.
