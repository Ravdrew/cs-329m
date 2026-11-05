#!/usr/bin/env python3
"""Build the coding agent's prompt for one task and condition, so every condition gets identical wording.

    python3 make_prompt.py PULL [--spec] [--graph GRAPH.yaml | --graph-text GRAPH.md] [-o PROMPT.md]
                           [--workdir DIR] [--env-script PATH]

The template is the one the 2026-10-30 pilot used (PR description as the developer wrote it, the same work
instructions and rules). The pieces are added in this order, and only the graph block differs between the
no-graph condition and the text channel:

    1. intro and the PR description (benchmark/tasks.json `problem_statement`)
    2. the interface spec, with --spec (specs-final/PULL.md, the same in every condition)
    3. the graph, with --graph (rendered here by graph_to_text.py with its defaults) or --graph-text (pre-rendered)
    4. work instructions and rules

The prompt is printed (or written with -o) and its sha256 goes to stderr, for the run log.
Env: BENCH_TASKS (default tasks.json next to this file if present, else ../benchmark/tasks.json), SPECS_DIR (default
specs-final next to this file).
"""
import argparse
import hashlib
import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent

INTRO = ('You are a software engineer working on the Cal.com monorepo, checked out at {workdir} (TypeScript, '
         'Next.js, tRPC, Prisma, Vitest). Dependencies are installed.\n\n'
         'Your task, as written by the developer who requested it (links to screenshots and videos in the '
         'original are not available to you):\n\n---\n{problem}\n---')

GRAPH_INTRO = ('## Component graph\n\n'
               'The developer also gave you a component graph of the codebase as it is in your checkout. '
               'If the graph marks a requested change, that is part of the task.\n\n'
               '<component_graph>\n{graph}</component_graph>')

WORK = ('Implement this change in the repository. Work the way you normally would on an unfamiliar codebase: find '
        'the relevant code, make the change, and add or update unit tests where it makes sense.')

RULES = ('Rules:\n'
         '- Work only inside {workdir}. Do not read, list or search any other directory on this machine, and do not '
         'use the web or any network resource. The repository has no useful git history; do not look for the '
         'original change anywhere.\n'
         '- To run commands, first run `source {env}` in the same shell command (it sets up Node 20 and Yarn). '
         'For example: `source {env} && cd {workdir} && TZ=UTC yarn vitest run path/to/file.test.ts`. If you change '
         'the Prisma schema, regenerate the client with `source {env} && cd {workdir}/packages/prisma && yarn '
         'post-install` (there is no database, so you cannot apply migrations, but you can write one). '
         'Type-checking a single package is possible with `yarn tsc --noEmit -p <package>/tsconfig.json`, but the '
         'whole repo is slow to type-check, so prefer targeted checks.\n'
         '- Leave your changes in the working tree (do not commit).')


def load_task(pull):
    default = HERE / 'tasks.json' if (HERE / 'tasks.json').exists() else HERE.parent / 'benchmark' / 'tasks.json'
    path = Path(os.environ.get('BENCH_TASKS', default))
    for t in json.loads(path.read_text()):
        if int(t['pull_number']) == int(pull):
            return t
    raise SystemExit(f'task {pull} not in {path}')


def build(pull, spec=False, graph=None, graph_text=None, workdir='/work/calcom', env='/work/env.sh'):
    task = load_task(pull)
    parts = [INTRO.format(workdir=workdir, problem=task['problem_statement'].replace('\r\n', '\n').strip())]
    if spec:
        sp = Path(os.environ.get('SPECS_DIR', HERE / 'specs-final')) / f'{pull}.md'
        if not sp.exists():
            raise SystemExit(f'no spec for {pull}: {sp}')
        parts.append(sp.read_text().strip())
    if graph and graph_text:
        raise SystemExit('give --graph or --graph-text, not both')
    if graph:
        import yaml
        from graph_to_text import render
        text = render(yaml.safe_load(Path(graph).read_text()))
        parts.append(GRAPH_INTRO.format(graph=text))
    elif graph_text:
        parts.append(GRAPH_INTRO.format(graph=Path(graph_text).read_text()))
    parts.append(WORK)
    parts.append(RULES.format(workdir=workdir, env=env))
    return '\n\n'.join(parts) + '\n'


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('pull', type=int)
    ap.add_argument('--spec', action='store_true', help='append specs-final/PULL.md')
    ap.add_argument('--graph', help='graph YAML to render into the prompt (text channel)')
    ap.add_argument('--graph-text', help='pre-rendered graph text to put into the prompt')
    ap.add_argument('--workdir', default='/work/calcom')
    ap.add_argument('--env-script', default='/work/env.sh')
    ap.add_argument('-o', '--out')
    a = ap.parse_args(argv)
    prompt = build(a.pull, a.spec, a.graph, a.graph_text, a.workdir, a.env_script)
    if a.out:
        Path(a.out).write_text(prompt)
    else:
        sys.stdout.write(prompt)
    print(f'sha256 {hashlib.sha256(prompt.encode()).hexdigest()}  chars {len(prompt)}', file=sys.stderr)


if __name__ == '__main__':
    main()
