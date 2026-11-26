"""Write a copy of a hot-start graph with its dropped edges put back, so Q1 can be scored with and without drops.

Usage:
    python3 scoring/with_dropped.py GRAPH.yaml OUT.yaml

Hot-start graphs list every edge the model or host dropped under x-codegraph.dropped_edges (id, from, to, kind,
counts, reason and, for newer runs, category). This restores each one as an ordinary edge, marked with
x-restored-drop so it can be told apart. Score both files with score_graph.py: the difference in edge precision
and recall is what dropping changed. Graphs with no dropped edges are copied unchanged.
"""
import sys

import yaml


def restore(graph):
    dropped = (graph.get('x-codegraph') or {}).get('dropped_edges') or []
    edges = list(graph.get('edges') or [])
    for d in dropped:
        edges.append({
            'id': d['id'], 'from': d['from'], 'to': d['to'], 'kind': d['kind'],
            'provenance': 'inferred', 'status': 'existing',
            'x-restored-drop': {k: d[k] for k in ('category', 'by', 'reason') if k in d},
        })
    return {**graph, 'edges': edges}, len(dropped)


def main(argv):
    if len(argv) != 3:
        sys.exit(__doc__)
    with open(argv[1]) as f:
        graph = yaml.safe_load(f)
    out, n = restore(graph)
    with open(argv[2], 'w') as f:
        yaml.safe_dump(out, f, sort_keys=False, allow_unicode=True)
    print(f'{argv[2]}: {len(out["edges"])} edges ({n} restored)')


if __name__ == '__main__':
    main(sys.argv)
