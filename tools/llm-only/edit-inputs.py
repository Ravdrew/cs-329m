#!/usr/bin/env python3
"""Make the input folder a blind edit author gets for one PR (see EDITS.md): pr.md, spec.md, graph.md, graph.yaml.

    python3 tools/llm-only/edit-inputs.py PULL GRAPH.yaml OUT_DIR --data TEAM_CHECKOUT

Only the PR description (benchmark/tasks.json problem_statement), the interface spec (q2q3-tools/specs-final) and
the base graph go in: never the diff, the PR's file list, its tests or any result.
"""
import argparse, json, shutil, sys
from pathlib import Path

ap = argparse.ArgumentParser()
ap.add_argument('pull', type=int); ap.add_argument('graph'); ap.add_argument('out'); ap.add_argument('--data', required=True)
a = ap.parse_args()
data = Path(a.data)
sys.path.insert(0, str(data / 'q2q3-tools'))
import yaml
from graph_to_text import render
task = next(t for t in json.load(open(data / 'benchmark' / 'tasks.json')) if t['pull_number'] == a.pull)
out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
(out / 'pr.md').write_text(task['problem_statement'].replace('\r\n', '\n').strip() + '\n')
shutil.copy(data / 'q2q3-tools' / 'specs-final' / f'{a.pull}.md', out / 'spec.md')
shutil.copy(a.graph, out / 'graph.yaml')
(out / 'graph.md').write_text(render(yaml.safe_load(Path(a.graph).read_text())))
print(out, {p.name: p.stat().st_size for p in sorted(out.iterdir())})
