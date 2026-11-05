#!/usr/bin/env python3
"""Render a component graph (schema/graph.schema.json) as prose for the Q2/Q3 text channel.

    python3 graph_to_text.py GRAPH.yaml [-o OUT.md] [--max-files N] [--edge-evidence {files,none}]
                             [--evidence-per-edge N]

The output is what a coding agent reads in the text condition: the requested change first (every node or edge whose
`status` is new, modify or delete, with its developer `note`), then the whole graph, node by node, with each node's
files and outgoing dependencies. The rendering is deterministic: the same graph gives byte-identical text.

What is left out, on purpose:
- every `x-*` field, so the code excerpts in `x-source-evidence` never reach the agent (team default 4: no code
  excerpts in graph text). Fenced code blocks inside descriptions or notes are replaced with "[code omitted]";
- `provenance` and the builder's own bookkeeping (CodeGraph edge counts, static-edge ids);
- evidence notes. Evidence is shown as `file:line` only (at most `--evidence-per-edge`, default 2, then "and N
  more"), or not at all with `--edge-evidence none`.

Large file lists are summarised by directory once a node has more than `--max-files` files (default 40), so a
whole-repository graph stays a readable size. `--max-files 0` lists every file.
"""
import argparse
import re
import sys
from collections import OrderedDict
from pathlib import Path

import yaml

VERB = {'renders': 'renders', 'navigates': 'navigates to', 'calls': 'calls', 'reads': 'reads from',
        'writes': 'writes to', 'emits': 'emits events to', 'uses': 'uses'}
KIND_ORDER = ['renders', 'navigates', 'calls', 'reads', 'writes', 'emits', 'uses']
CHANGE = {'new': 'new', 'modify': 'modify', 'delete': 'delete'}
FENCE = re.compile(r'```.*?(```|$)', re.S)
AUTO_EDGE_LABEL = re.compile(r'^(renders|navigates|calls|reads|writes|emits|uses) \(\d+\)$')


def clean(text):
    """Collapse whitespace and drop fenced code; returns '' for None."""
    if not text:
        return ''
    text = FENCE.sub('[code omitted]', str(text))
    return ' '.join(text.split())


def file_path(ref):
    return ref if isinstance(ref, str) else ref['path']


def file_line(ref):
    if isinstance(ref, str):
        return f'`{ref}`'
    extra = []
    if ref.get('role'):
        extra.append(ref['role'])
    if ref.get('lines'):
        extra.append(f"lines {ref['lines'][0]}-{ref['lines'][1]}")
    return f"`{ref['path']}`" + (f" ({', '.join(extra)})" if extra else '')


def summarise_files(files, limit):
    """Every file when there are few; otherwise the files with a role, then directories with counts."""
    if limit == 0 or len(files) <= limit:
        return [file_line(f) for f in files]
    lines = [file_line(f) + ' (key file)' for f in files if isinstance(f, dict) and f.get('role')]
    dirs = OrderedDict()
    for f in files:
        d = file_path(f).rsplit('/', 1)[0] if '/' in file_path(f) else '.'
        dirs[d] = dirs.get(d, 0) + 1
    # merge directories upward until the list fits
    depth = max(d.count('/') for d in dirs) + 1
    while len(dirs) > limit and depth > 0:
        depth -= 1
        merged = OrderedDict()
        for d, n in dirs.items():
            key = '/'.join(d.split('/')[:depth + 1])
            merged[key] = merged.get(key, 0) + n
        dirs = merged
    lines += [f'`{d}/` ({n} file{"s" if n != 1 else ""})' for d, n in sorted(dirs.items())]
    return lines


def evidence_text(edge, mode, per_edge=2):
    if mode == 'none':
        return ''
    refs = []
    for ev in edge.get('evidence') or []:
        ref = ev['file'] + (f":{ev['line']}" if ev.get('line') else '')
        if ref not in refs:
            refs.append(ref)
    if not refs:
        return ''
    shown = ', '.join(f'`{r}`' for r in refs[:per_edge])
    more = f' and {len(refs) - per_edge} more' if len(refs) > per_edge else ''
    return f' Evidence: {shown}{more}.'


def edge_phrase(edge, names):
    verb = VERB.get(edge['kind'], edge['kind'])
    return f"**{names.get(edge['from'], edge['from'])}** {verb} **{names.get(edge['to'], edge['to'])}**"


def sentence(text):
    text = text.rstrip('.')
    return text[:1].upper() + text[1:] + '.' if text else ''


def edge_detail(edge, ev_mode, per_edge=2):
    parts = []
    label = clean(edge.get('label'))
    if label and not AUTO_EDGE_LABEL.match(label):
        parts.append(sentence(label))
    desc = clean(edge.get('description'))
    if desc:
        parts.append(sentence(desc))
    text = ' '.join(parts)
    return (f' {text}' if text else '') + evidence_text(edge, ev_mode, per_edge)


def render(graph, max_files=40, ev_mode='files', per_edge=2):
    nodes = graph.get('nodes') or []
    edges = graph.get('edges') or []
    groups = {g['id']: g for g in graph.get('groups') or []}
    names = {n['id']: f"{clean(n['label'])} [{n['id']}]" for n in nodes}
    status = lambda x: CHANGE.get(x.get('status') or 'existing')

    out = []
    title = clean(graph.get('title')) or 'Component graph'
    out.append(f'# {title}')
    out.append('')
    head = f"This is a component-level map of the `{graph.get('repo', 'repository')}` code"
    if graph.get('commit'):
        head += f" at commit `{str(graph['commit'])[:12]}`"
    head += (f'. It has {len(nodes)} components and {len(edges)} dependencies between them. Component names are '
             'followed by their id in square brackets. A sentence such as "A calls B" means code in A '
             'depends on B.')
    out.append(head)
    desc = clean(graph.get('description'))
    if desc:
        out += ['', desc]

    # 1. the requested change
    changed_nodes = [n for n in nodes if status(n)]
    changed_edges = [e for e in edges if status(e)]
    out += ['', '## Requested change', '']
    if not changed_nodes and not changed_edges:
        out.append('None. The graph describes the code as it is; no component or dependency is marked as changed.')
    else:
        out.append('The developer marked these parts of the graph as changed. Implement them; the rest of the graph '
                   'below is the code as it is now.')
        verbs = {'new': 'Add component', 'modify': 'Change component', 'delete': 'Remove component'}
        for n in changed_nodes:
            line = f"- {verbs[status(n)]} {names[n['id']]} ({n['kind']})"
            summary = clean(n.get('summary'))
            line += f': {summary}' if summary else '.'
            out.append(line)
            if status(n) == 'new' and clean(n.get('description')):
                out.append(f"  - Description: {clean(n['description'])}")
            if n.get('routes'):
                out.append('  - Routes: ' + ', '.join(f'`{r}`' for r in n['routes']))
            if clean(n.get('note')):
                out.append(f"  - Developer note: {clean(n['note'])}")
            if status(n) == 'new' and n.get('files'):
                out.append('  - Files: ' + ', '.join(summarise_files(n['files'], max_files)))
        everbs = {'new': 'Add dependency', 'modify': 'Change dependency', 'delete': 'Remove dependency'}
        for e in changed_edges:
            line = f"- {everbs[status(e)]}: {edge_phrase(e, names)}."
            label = clean(e.get('label'))
            if label and not AUTO_EDGE_LABEL.match(label):
                line += f' ({label})'
            out.append(line)
            if clean(e.get('note')):
                out.append(f"  - Developer note: {clean(e['note'])}")

    # 2. the graph, grouped
    out += ['', '## Components', '']
    by_group = OrderedDict()
    for n in nodes:
        by_group.setdefault(n.get('group'), []).append(n)
    outgoing = {}
    for e in edges:
        outgoing.setdefault(e['from'], []).append(e)
    incoming_count = {}
    for e in edges:
        incoming_count[e['to']] = incoming_count.get(e['to'], 0) + 1

    def group_path(gid):
        chain, seen = [], set()
        while gid and gid in groups and gid not in seen:
            seen.add(gid)
            chain.append(clean(groups[gid]['label']))
            gid = groups[gid].get('parent')
        return ' > '.join(reversed(chain))

    for gid, members in by_group.items():
        if gid:
            out.append(f'### Group: {group_path(gid)}')
            gsum = clean(groups.get(gid, {}).get('summary'))
            if gsum:
                out.append(gsum)
            out.append('')
        for n in members:
            mark = {'new': ' (NEW, requested)', 'modify': ' (TO CHANGE, requested)',
                    'delete': ' (TO REMOVE, requested)'}.get(status(n), '')
            out.append(f"#### {names[n['id']]}{mark}")
            out.append(f"Kind: {n['kind']}.")
            for field in ('summary', 'description'):
                text = clean(n.get(field))
                if text and not (field == 'description' and text == clean(n.get('summary'))):
                    out.append(text)
            if n.get('routes'):
                out.append('Routes: ' + ', '.join(f'`{r}`' for r in n['routes']) + '.')
            files = n.get('files') or []
            if files:
                out.append(f'Files ({len(files)}):')
                out += [f'- {f}' for f in summarise_files(files, max_files)]
            else:
                out.append('Files: none yet.')
            outs = sorted(outgoing.get(n['id'], []),
                          key=lambda e: (KIND_ORDER.index(e['kind']) if e['kind'] in KIND_ORDER else 99, e['to']))
            if outs:
                out.append('This component:')
                for e in outs:
                    emark = {'new': ' (NEW, requested)', 'modify': ' (TO CHANGE, requested)',
                             'delete': ' (TO REMOVE, requested)'}.get(status(e), '')
                    verb = VERB.get(e['kind'], e['kind'])
                    out.append(f"- {verb} **{names.get(e['to'], e['to'])}**{emark}.{edge_detail(e, ev_mode, per_edge)}")
            used_by = incoming_count.get(n['id'], 0)
            out.append(f'Used by {used_by} other component{"s" if used_by != 1 else ""}.')
            out.append('')
    return '\n'.join(out).rstrip() + '\n'


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('graph')
    ap.add_argument('-o', '--out')
    ap.add_argument('--max-files', type=int, default=40)
    ap.add_argument('--edge-evidence', choices=['files', 'none'], default='files')
    ap.add_argument('--evidence-per-edge', type=int, default=2)
    a = ap.parse_args(argv)
    graph = yaml.safe_load(Path(a.graph).read_text())
    text = render(graph, a.max_files, a.edge_evidence, a.evidence_per_edge)
    if a.out:
        Path(a.out).write_text(text)
    else:
        sys.stdout.write(text)


if __name__ == '__main__':
    main()
