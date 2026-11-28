#!/usr/bin/env python3
"""Build the coding agent's prompt for one task and condition, so every condition gets identical wording.

    python3 make_prompt.py PULL [--spec] [--graph GRAPH.yaml | --graph-text GRAPH.md | --graph-tools {graph,codegraph}
                           | --intent INTENT.md | --brief BRIEF.md] [-o PROMPT.md] [--workdir DIR] [--env-script PATH]

The template is the one the 2026-10-30 pilot used (PR description as the developer wrote it, the same work
instructions and rules). The pieces are added in this order, and only block 3 differs between conditions:

    1. intro and the PR description (benchmark/tasks.json `problem_statement`)
    2. the interface spec, with --spec (specs-final/PULL.md, the same in every condition)
    3. one of: the graph, with --graph (rendered here by graph_to_text.py with its defaults) or --graph-text
       (pre-rendered); a note that the graph is available through tools, with --graph-tools (tool channel, or the
       CodeGraph control); or the developer's intent written as prose, with --intent (the prose-intent condition).
       --intent with --graph-tools codegraph gives both, intent first (the codegraph-intent condition); or a
       1-3 sentence request in the developer's words, with --brief (the prose-brief condition)
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

# Tool channel: the same opening as GRAPH_INTRO; the graph itself is served by tools/graph-mcp.
TOOLS_INTRO = {
    'graph': ('## Component graph\n\n'
              'The developer also gave you a component graph of the codebase as it is in your checkout. '
              'If the graph marks a requested change, that is part of the task. '
              'Read it with the graph tools (their names start with `mcp__graph__`).'),
    # Same graph and tools as 'graph', plus what the graph is for and how to use it (tool-guided condition).
    'graph-guided': ('## Component graph\n\n'
                     'The developer also gave you a component graph of the codebase as it is in your checkout. '
                     'If the graph marks a requested change, that is part of the task.\n\n'
                     'The graph is a map of the codebase, written to help you find your way around it. Each component '
                     'lists the source files it owns, and each dependency says how two components connect (calls, '
                     'renders, reads, writes or emits) and where in the code that happens. Use it to find the code '
                     'you need before you search for it:\n\n'
                     '1. Call `mcp__graph__get_requested_change` to see what the developer marked.\n'
                     '2. For each component it names, call `mcp__graph__get_node` to see its files and what it '
                     'connects to, and `mcp__graph__neighbors` to see what else the change will touch.\n'
                     '3. When you meet a file or a feature you do not know, `mcp__graph__find_components` tells you '
                     'which component owns it, and `mcp__graph__get_edge` shows where two components connect.\n\n'
                     'Open the files the graph points to, and search the code for what the graph does not cover. '
                     'The graph can be incomplete, so check what it says against the code.'),
    'codegraph': ('## Code graph\n\n'
                  'You also have CodeGraph, an index of the code in your checkout: every function, class, component '
                  'and type, the file and lines it is in, and the calls, imports and renders between them. It is '
                  'available as the tool `mcp__codegraph__codegraph_explore`. Give it a short question in plain words '
                  '(for example "how is the payment amount computed for a booking") or the names of functions, '
                  'components or files (for example "handlePayment getBookingFields"). It returns the source of the '
                  'matching code with line numbers, grouped by file, the call paths between the pieces, and what '
                  'depends on them. It keeps up with your edits a second or so after you make them.\n\n'
                  'When to use it:\n\n'
                  '1. Before you search or open files: call it with the names and words from the request to find the '
                  'code the change is about.\n'
                  '2. Before you change a function, component or type: call it with that name to see what calls or '
                  'uses it, so that you update everything the change affects.\n'
                  '3. When you need to know how two parts of the code connect: name both, and it shows the path '
                  'between them.\n\n'
                  'It indexes source code only: read or search configuration files, translations and docs as usual. '
                  'If a result starts with a warning that files were edited since the last sync, read those files '
                  'directly.'),
}

INTENT_INTRO = ('## What the developer intends\n\n'
                'The developer also described how the change should fit into the codebase:\n\n{intent}')

BRIEF_INTRO = ('## What the developer asked for\n\n'
               'The developer’s request, in their own words:\n\n{brief}')

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


def build(pull, spec=False, graph=None, graph_text=None, workdir='/work/calcom', env='/work/env.sh',
          graph_tools=None, intent=None, brief=None):
    task = load_task(pull)
    parts = [INTRO.format(workdir=workdir, problem=task['problem_statement'].replace('\r\n', '\n').strip())]
    if spec:
        sp = Path(os.environ.get('SPECS_DIR', HERE / 'specs-final')) / f'{pull}.md'
        if not sp.exists():
            raise SystemExit(f'no spec for {pull}: {sp}')
        parts.append(sp.read_text().strip())
    # The intent can go with CodeGraph (the codegraph-intent condition: CodeGraph has no description of the change);
    # our graph's edit already is one, so the intent never goes with the graph itself.
    blocks = [x for x in (graph, graph_text, graph_tools, intent, brief) if x is not None]
    if len(blocks) > 1 and not (len(blocks) == 2 and intent is not None and graph_tools == 'codegraph'):
        raise SystemExit('give at most one of --graph, --graph-text, --graph-tools, --intent, --brief '
                         '(or --intent with --graph-tools codegraph)')
    if graph:
        import yaml
        from graph_to_text import render
        text = render(yaml.safe_load(Path(graph).read_text()))
        parts.append(GRAPH_INTRO.format(graph=text))
    elif graph_text:
        parts.append(GRAPH_INTRO.format(graph=Path(graph_text).read_text()))
    if intent:
        parts.append(INTENT_INTRO.format(intent=Path(intent).read_text().strip()))
    if brief:
        parts.append(BRIEF_INTRO.format(brief=Path(brief).read_text().strip()))
    if graph_tools:
        parts.append(TOOLS_INTRO[graph_tools])
    parts.append(WORK)
    parts.append(RULES.format(workdir=workdir, env=env))
    return '\n\n'.join(parts) + '\n'


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('pull', type=int)
    ap.add_argument('--spec', action='store_true', help='append specs-final/PULL.md')
    ap.add_argument('--graph', help='graph YAML to render into the prompt (text channel)')
    ap.add_argument('--graph-text', help='pre-rendered graph text to put into the prompt')
    ap.add_argument('--graph-tools', choices=sorted(TOOLS_INTRO), help='the graph is served through tools (tool channel)')
    ap.add_argument('--intent', help="the developer's intent as prose (prose-intent condition)")
    ap.add_argument('--brief', help="a 1-3 sentence request in the developer's words (prose-brief condition)")
    ap.add_argument('--workdir', default='/work/calcom')
    ap.add_argument('--env-script', default='/work/env.sh')
    ap.add_argument('-o', '--out')
    a = ap.parse_args(argv)
    prompt = build(a.pull, a.spec, a.graph, a.graph_text, a.workdir, a.env_script, a.graph_tools, a.intent, a.brief)
    if a.out:
        Path(a.out).write_text(prompt)
    else:
        sys.stdout.write(prompt)
    print(f'sha256 {hashlib.sha256(prompt.encode()).hexdigest()}  chars {len(prompt)}', file=sys.stderr)


if __name__ == '__main__':
    main()
