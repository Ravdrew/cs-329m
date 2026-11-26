#!/usr/bin/env python3
"""Checks for graph_to_text.py and make_prompt.py.  Run: python3 -m pytest -q test_graph_text.py
GRAPHS (env, colon-separated) adds real graphs to the leak and determinism checks."""
import json
import os
import re
from pathlib import Path

import pytest
import yaml

import graph_to_text as g2t
import make_prompt

HERE = Path(__file__).resolve().parent

TOY = {
    'version': 1, 'repo': 'acme/app', 'commit': 'abc1234567890', 'title': 'Toy',
    'description': 'Toy graph.\n```ts\nconst secret = 1;\n```',
    'groups': [{'id': 'ui', 'label': 'UI'}, {'id': 'pages', 'label': 'Pages', 'parent': 'ui'}],
    'nodes': [
        {'id': 'home', 'label': 'Home page', 'kind': 'page', 'group': 'pages', 'summary': 'Landing.',
         'files': [{'path': 'app/page.tsx', 'role': 'route'}], 'routes': ['/'],
         'x-source-evidence': [{'path': 'app/page.tsx', 'start_line': 1, 'end_line': 3,
                                'excerpt': 'export default function Home() { return LEAKED_CODE_TOKEN }'}]},
        {'id': 'api', 'label': 'API', 'kind': 'endpoint', 'files': [f'api/r{i}/h.ts' for i in range(60)]},
        {'id': 'list', 'label': 'List page', 'kind': 'page', 'status': 'new', 'files': [],
         'summary': 'Lists things.', 'note': 'Group by day.'},
        {'id': 'old', 'label': 'Old page', 'kind': 'page', 'status': 'delete', 'files': ['app/old.tsx']},
    ],
    'edges': [
        {'id': 'e1', 'from': 'home', 'to': 'api', 'kind': 'calls', 'label': 'fetch data',
         'evidence': [{'file': 'app/page.tsx', 'line': 4, 'note': 'NOTE_SHOULD_NOT_APPEAR'},
                      {'file': 'app/a.tsx', 'line': 1}, {'file': 'app/b.tsx', 'line': 2}],
         'x-codegraph': {'raw_edge_count': 99}},
        {'id': 'e2', 'from': 'home', 'to': 'list', 'kind': 'navigates', 'status': 'new'},
        {'id': 'e3', 'from': 'home', 'to': 'old', 'kind': 'navigates', 'status': 'delete', 'note': 'Drop the link.'},
    ],
}


def test_change_section_lists_every_marked_item():
    t = g2t.render(TOY)
    change = t.split('## Requested change')[1].split('## Components')[0]
    assert 'Add component List page [list] (page): Lists things.' in change
    assert 'Developer note: Group by day.' in change
    assert 'Remove component Old page [old]' in change
    assert 'Add dependency: **Home page [home]** navigates to **List page [list]**.' in change
    assert 'Remove dependency: **Home page [home]** navigates to **Old page [old]**.' in change
    assert 'Developer note: Drop the link.' in change
    assert 'Home page [home]' not in change.split('Add dependency')[0]  # unchanged node not listed as a change


def test_no_change_section_when_unedited():
    plain = json.loads(json.dumps(TOY))
    for x in plain['nodes'] + plain['edges']:
        x.pop('status', None)
    assert 'None. The graph describes the code as it is' in g2t.render(plain)


def test_no_code_or_builder_internals():
    t = g2t.render(TOY)
    assert 'LEAKED_CODE_TOKEN' not in t and 'const secret' not in t and '[code omitted]' in t
    assert 'NOTE_SHOULD_NOT_APPEAR' not in t and '99' not in t
    assert 'provenance' not in t


def test_evidence_limit_and_none():
    t = g2t.render(TOY)
    assert '`app/page.tsx:4`, `app/a.tsx:1` and 1 more' in t
    assert 'Evidence:' not in g2t.render(TOY, ev_mode='none')


def test_file_summary_by_directory():
    t = g2t.render(TOY, max_files=10)
    assert 'Files (60):' in t and '`api/` (60 files)' in t
    assert 'api/r59/h.ts' in g2t.render(TOY, max_files=0)


def test_group_path_and_marks():
    t = g2t.render(TOY)
    assert '### Group: UI > Pages' in t
    assert '#### List page [list] (NEW, requested)' in t
    assert '- navigates to **Old page [old]** (TO REMOVE, requested).' in t


def test_deterministic():
    assert g2t.render(TOY) == g2t.render(json.loads(json.dumps(TOY)))


def real_graphs():
    return [Path(p) for p in os.environ.get('GRAPHS', '').split(':') if p]


@pytest.mark.parametrize('path', real_graphs(), ids=lambda p: p.name)
def test_real_graph_no_excerpt_leak(path):
    graph = yaml.safe_load(path.read_text())
    text = g2t.render(graph)
    assert text == g2t.render(yaml.safe_load(path.read_text()))
    leaked = []
    for item in graph['nodes'] + graph['edges']:
        for ev in item.get('x-source-evidence') or []:
            for line in (ev.get('excerpt') or '').splitlines():
                line = line.strip()
                # long, code-looking lines only: short ones (`}` or an import of a file the graph lists) are noise
                if len(line) >= 40 and re.search(r'[;{}()=]', line) and line in text:
                    leaked.append(line)
    assert not leaked, leaked[:3]
    for n in graph['nodes']:
        assert f"[{n['id']}]" in text


def test_prompt_conditions_differ_only_in_graph_block(tmp_path, monkeypatch):
    tasks = [{'pull_number': 1, 'problem_statement': 'Fix the thing.\r\nPlease.'}]
    (tmp_path / 'tasks.json').write_text(json.dumps(tasks))
    (tmp_path / '1.md').write_text('## Interface the tests expect\n\nNew file `x.ts`.\n')
    gpath = tmp_path / 'g.yaml'
    gpath.write_text(yaml.safe_dump(TOY))
    monkeypatch.setenv('BENCH_TASKS', str(tmp_path / 'tasks.json'))
    monkeypatch.setenv('SPECS_DIR', str(tmp_path))
    base = make_prompt.build(1, spec=True)
    text = make_prompt.build(1, spec=True, graph=str(gpath))
    assert 'Fix the thing.\nPlease.' in base and 'New file `x.ts`.' in base
    assert '<component_graph>' not in base
    start, end = text.index('## Component graph'), text.index('</component_graph>') + len('</component_graph>\n\n')
    assert text[:start] + text[end:] == base
    assert text.index('Interface the tests expect') < start < text.index('Implement this change')


def test_tool_and_intent_conditions_differ_only_in_their_block(tmp_path, monkeypatch):
    tasks = [{'pull_number': 1, 'problem_statement': 'Fix the thing.'}]
    (tmp_path / 'tasks.json').write_text(json.dumps(tasks))
    (tmp_path / '1.md').write_text('## Interface the tests expect\n\nNew file `x.ts`.\n')
    (tmp_path / 'intent.md').write_text('Add a page that lists bookings.\n')
    monkeypatch.setenv('BENCH_TASKS', str(tmp_path / 'tasks.json'))
    monkeypatch.setenv('SPECS_DIR', str(tmp_path))
    base = make_prompt.build(1, spec=True)
    for kwargs, block in [({'graph_tools': 'graph'}, make_prompt.TOOLS_INTRO['graph']),
                          ({'graph_tools': 'codegraph'}, make_prompt.TOOLS_INTRO['codegraph']),
                          ({'intent': str(tmp_path / 'intent.md')},
                           make_prompt.INTENT_INTRO.format(intent='Add a page that lists bookings.'))]:
        prompt = make_prompt.build(1, spec=True, **kwargs)
        assert prompt.replace(block + '\n\n', '', 1) == base
        assert prompt.index('Interface the tests expect') < prompt.index(block) < prompt.index('Implement this change')
    # The tool channel opens exactly like the text channel's graph block.
    assert make_prompt.TOOLS_INTRO['graph'].startswith(make_prompt.GRAPH_INTRO.split('\n\n<component_graph>')[0])
    with pytest.raises(SystemExit):
        make_prompt.build(1, graph_tools='graph', intent=str(tmp_path / 'intent.md'))
