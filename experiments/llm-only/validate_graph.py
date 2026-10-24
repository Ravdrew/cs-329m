#!/usr/bin/env python3
"""Validate the bundled schema, graph integrity and pinned source provenance."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import sys

HERE = Path(__file__).resolve().parent
DEFAULT_REPO = Path(os.environ.get('CALCOM_DIR', HERE.parents[1] / 'work' / 'calcom'))


def validate_shape(value, spec, schema, at='$'):
    """Evaluate the JSON Schema keywords used by the bundled, local schema."""
    errors = []
    if '$ref' in spec:
        spec = schema['$defs'][spec['$ref'].split('/')[-1]]
    types = {'object': dict, 'array': list, 'string': str, 'integer': int}
    kind = spec.get('type')
    if kind and (type(value) is not types[kind]):
        return [f'{at}: expected {kind}']
    if 'const' in spec and value != spec['const']:
        errors.append(f'{at}: expected {spec["const"]!r}')
    if 'enum' in spec and value not in spec['enum']:
        errors.append(f'{at}: unknown value {value!r}')
    if kind == 'object':
        props = spec.get('properties', {})
        for key in spec.get('required', []):
            if key not in value:
                errors.append(f'{at}: missing {key}')
        if len(value) < spec.get('minProperties', 0):
            errors.append(f'{at}: too few properties')
        for key, item in value.items():
            rule = props.get(key, spec.get('additionalProperties', True))
            if rule is False:
                errors.append(f'{at}: unexpected {key}')
            elif isinstance(rule, dict):
                errors.extend(validate_shape(item, rule, schema, f'{at}.{key}'))
    elif kind == 'array':
        if len(value) < spec.get('minItems', 0):
            errors.append(f'{at}: too few items')
        if spec.get('uniqueItems') and len({json.dumps(x, sort_keys=True) for x in value}) != len(value):
            errors.append(f'{at}: duplicate items')
        for index, item in enumerate(value):
            errors.extend(validate_shape(item, spec['items'], schema, f'{at}[{index}]'))
    elif kind == 'string':
        if len(value) < spec.get('minLength', 0):
            errors.append(f'{at}: empty string')
        if 'pattern' in spec and not re.search(spec['pattern'], value):
            errors.append(f'{at}: invalid format')
    elif kind == 'integer' and value < spec.get('minimum', value):
        errors.append(f'{at}: below minimum')
    return errors


def safe_source(repo, relative):
    path = PurePosixPath(relative)
    if path.is_absolute() or '..' in path.parts or '\\' in relative or relative != path.as_posix():
        raise ValueError(f'unsafe source path: {relative}')
    full = (repo / relative).resolve()
    try:
        full.relative_to(repo.resolve())
    except ValueError:
        raise ValueError(f'source escapes checkout: {relative}') from None
    return full


def git(repo, *args):
    return subprocess.check_output(['git', '-C', str(repo), *args], text=True, stderr=subprocess.PIPE).strip()


def validate(graph, repo, schema):
    errors = validate_shape(graph, schema, schema)
    if errors:
        return errors
    try:
        if git(repo, 'rev-parse', 'HEAD') != graph['repository']['commit']:
            errors.append('checkout commit differs from graph.repository.commit')
        tracked = set(git(repo, 'ls-tree', '-r', '--name-only', graph['repository']['commit']).splitlines())
        if git(repo, 'diff', '--name-only', 'HEAD', '--'):
            errors.append('checkout has modified tracked source files')
    except subprocess.CalledProcessError:
        return errors + ['cannot verify the pinned Git checkout']
    node_ids = [n['id'] for n in graph['nodes']]
    node_types = {n['id']: n['type'] for n in graph['nodes']}
    edge_ids = [e['id'] for e in graph['edges']]
    for label, ids in [('node', node_ids), ('edge', edge_ids)]:
        if len(ids) != len(set(ids)):
            errors.append(f'duplicate {label} ID')
    triples = [(e['source'], e['type'], e['target']) for e in graph['edges']]
    if len(triples) != len(set(triples)):
        errors.append('duplicate edge relationship; consolidate its evidence')
    for edge in graph['edges']:
        if edge['source'] not in node_ids or edge['target'] not in node_ids:
            errors.append(f'{edge["id"]}: dangling endpoint')
        if edge['source'] == edge['target']:
            errors.append(f'{edge["id"]}: component self-edge')
        targets = {'reads': {'data_model'}, 'writes': {'data_model'},
                   'renders': {'ui_component', 'page', 'route'},
                   'navigates_to': {'page', 'route'}, 'calls': {'service', 'api_endpoint'}}
        if edge['target'] in node_types and node_types[edge['target']] not in targets[edge['type']]:
            errors.append(f'{edge["id"]}: incompatible relationship target type')
    needed = {e['path'] for item in graph['nodes'] + graph['edges'] for e in item['evidence']}
    for node in graph['nodes']:
        if set(node['files']) != {e['path'] for e in node['evidence']}:
            errors.append(f'{node["id"]}: every member file needs node evidence, and vice versa')
    needed.update(p for n in graph['nodes'] for p in n['files'])
    if needed != set(graph['source_files']):
        errors.append('source_files must exactly cover membership and evidence paths')
    contents = {}
    for path, digest in graph['source_files'].items():
        try:
            full = safe_source(repo, path)
            if path not in tracked:
                errors.append(f'{path}: not tracked at pinned commit')
                continue
            raw = full.read_bytes()
            if hashlib.sha256(raw).hexdigest() != digest:
                errors.append(f'{path}: source hash mismatch')
            contents[path] = raw.decode('utf-8').splitlines()
        except (OSError, UnicodeError, ValueError) as exc:
            errors.append(f'{path}: {exc}')
    for item in graph['nodes'] + graph['edges']:
        for evidence in item['evidence']:
            lines = contents.get(evidence['path'])
            if lines is None:
                errors.append(f'{item["id"]}: unavailable evidence source')
                continue
            start, end = evidence['start_line'], evidence['end_line']
            if not 1 <= start <= end <= len(lines):
                errors.append(f'{item["id"]}: invalid evidence line range')
            elif '\n'.join(lines[start-1:end]) != evidence['excerpt']:
                errors.append(f'{item["id"]}: evidence excerpt mismatch')
    return errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, default=DEFAULT_REPO)
    parser.add_argument('--graph', type=Path, default=HERE / 'graph.json')
    args = parser.parse_args()
    try:
        raw = args.graph.read_bytes()
        graph = json.loads(raw)
        schema = json.loads((HERE / 'graph.schema.json').read_text())
        errors = validate(graph, args.repo, schema)
    except (OSError, ValueError) as exc:
        print(json.dumps({'valid': False, 'errors': [str(exc)]}, indent=2))
        return 1
    report = {'valid': not errors, 'checked_at_utc': datetime.now(timezone.utc).isoformat(),
              'graph_sha256': hashlib.sha256(raw).hexdigest(), 'errors': errors,
              'limits': 'Checks structure and exact source provenance; does not establish semantic edge precision or recall.'}
    if not errors:
        report.update(source_commit=graph['repository']['commit'], nodes=len(graph['nodes']),
                      edges=len(graph['edges']), source_files=len(graph['source_files']))
    print(json.dumps(report, indent=2))
    return int(bool(errors))


if __name__ == '__main__':
    sys.exit(main())
