#!/usr/bin/env python3
"""Render the authored graph; no source dependencies are discovered here."""
import argparse
import html
import json
from pathlib import Path
from urllib.parse import quote
from validate_graph import DEFAULT_REPO, validate

HERE = Path(__file__).resolve().parent


def render(repo):
    graph = json.loads((HERE / 'graph.json').read_text())
    schema = json.loads((HERE / 'graph.schema.json').read_text())
    errors = validate(graph, repo, schema)
    if errors:
        raise SystemExit('\n'.join(errors))
    aliases = {node['id']: f'n{i}' for i, node in enumerate(graph['nodes'])}
    names = {node['id']: node['label'] for node in graph['nodes']}
    escaped = lambda text: html.escape(text, quote=True).replace('|', '&#124;')
    lines = ['flowchart LR']
    groups = list(dict.fromkeys(node['group'] for node in graph['nodes']))
    shapes = {'page': ('([', '])'), 'route': ('([', '])'), 'ui_component': ('[', ']'),
              'api_endpoint': ('{{', '}}'), 'service': ('(', ')'), 'data_model': ('[(', ')]')}
    for index, group in enumerate(groups):
        lines.append(f'  subgraph g{index}["{escaped(group)}"]')
        for node in graph['nodes']:
            if node['group'] == group:
                left, right = shapes[node['type']]
                lines.append(f'    {aliases[node["id"]]}{left}"{escaped(node["label"])}"{right}')
        lines.append('  end')
    for edge in graph['edges']:
        lines.append(f'  {aliases[edge["source"]]} -->|"{edge["type"]}: {escaped(edge["label"])}"| {aliases[edge["target"]]}')
    diagram = '\n'.join(lines) + '\n'
    (HERE / 'graph.mmd').write_text(diagram)
    base = graph['repository']['resolved_url'] + '/blob/' + graph['repository']['commit'] + '/'
    def link(evidence):
        start, end = evidence['start_line'], evidence['end_line']
        label = f'{evidence["path"]}:{start}-{end}'
        return f'[{label}]({base}{quote(evidence["path"], safe="/")}#L{start}-L{end})'
    review = ['# LLM-only booking graph', '',
              f'{len(graph["nodes"])} nodes, {len(graph["edges"])} edges; source commit `{graph["repository"]["commit"]}`.', '',
              'Generated from graph.json. All source links are pinned. This is a scoped, unevaluated prediction, not a reference graph.', '',
              '```mermaid', diagram.rstrip(), '```', '', '## Components', '']
    for node in graph['nodes']:
        review.extend([f'### {node["label"]} (`{node["id"]}`; {node["type"]})', '', node['summary'], '',
                       'Files and evidence: ' + '; '.join(link(e) for e in node['evidence']) + '.', ''])
    review.extend(['## Relationships', '', '| Source | Relationship | Target | Explanation and evidence |', '| --- | --- | --- | --- |'])
    for edge in graph['edges']:
        details = edge['description'].replace('|', '\\|') + ' ' + '; '.join(link(e) for e in edge['evidence'])
        review.append(f'| {names[edge["source"]]} | {edge["type"]} | {names[edge["target"]]} | {details} |')
    (HERE / 'graph-review.md').write_text('\n'.join(review) + '\n')
    print('Wrote graph.mmd and graph-review.md from validated graph.json')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, default=DEFAULT_REPO)
    render(parser.parse_args().repo)
