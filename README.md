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
