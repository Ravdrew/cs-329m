#!/usr/bin/env python3
"""Export the frozen prediction as the team's draft-v0/version-1 YAML graph."""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import re
import sys
from urllib.parse import urlsplit

from jsonschema import Draft202012Validator
import yaml

from validate_graph import DEFAULT_REPO, validate

HERE = Path(__file__).resolve().parent
SCHEMA_PATH = HERE.parents[1] / 'schema' / 'graph.schema.json'
NODE_KINDS = {'page': 'page', 'route': 'page', 'ui_component': 'component',
              'api_endpoint': 'endpoint', 'service': 'service', 'data_model': 'model'}
EDGE_KINDS = {'navigates_to': 'navigates'}
# These routes already occur in the frozen scope and component descriptions.
ROUTES = {
    'public-page': ['/[user]/[type]'],
    'public-event-api': ['viewer.public.event'],
    'slots-api': ['viewer.slots.getSchedule'],
    'reservations-api': ['viewer.slots.reserveSlot', 'viewer.slots.removeSelectedSlotMark'],
    'create-api': ['/api/book/event'],
    'recurring-api': ['/api/book/recurring-event'],
    'detail-page': ['/booking/[uid]'],
    'reschedule-page': ['/reschedule/[uid]'],
    'cancel-api': ['/api/cancel'],
    'host-page': ['/bookings/[status]'],
    'host-api': ['viewer.bookings.get', 'viewer.bookings.getBookingDetails', 'viewer.bookings.confirm'],
}


def convert(graph, digest):
    groups = {label: re.sub(r'[^a-z0-9]+', '-', label.lower()).strip('-')
              for label in dict.fromkeys(node['group'] for node in graph['nodes'])}
    result = {
        'version': 1,
        'repo': urlsplit(graph['repository']['resolved_url']).path.strip('/'),
        'commit': graph['repository']['commit'],
        'title': 'Cal.com booking subsystem — LLM-only',
        'description': graph['scope']['name'] + '.\n\n' + graph['scope']['coverage'],
        'groups': [{'id': identity, 'label': label} for label, identity in groups.items()],
        'nodes': [],
        'edges': [],
    }
    for node in graph['nodes']:
        exported = {
            'id': node['id'], 'label': node['label'], 'kind': NODE_KINDS[node['type']],
            'group': groups[node['group']],
            'summary': re.split(r'(?<=\.)\s+', node['summary'], maxsplit=1)[0],
            'description': node['summary'],
            'files': list(node['files']),
            'provenance': 'inferred', 'status': 'existing',
            'x-source-type': node['type'],
            'x-source-evidence': copy.deepcopy(node['evidence']),
        }
        if node['id'] in ROUTES:
            routes = ROUTES[node['id']]
            if not set(routes).issubset(graph['scope']['entrypoints']):
                raise ValueError('route mapping adds an entrypoint absent from the frozen prediction')
            exported['routes'] = list(routes)
        result['nodes'].append(exported)
    for edge in graph['edges']:
        result['edges'].append({
            'id': edge['id'], 'from': edge['source'], 'to': edge['target'],
            'kind': EDGE_KINDS.get(edge['type'], edge['type']),
            'label': edge['label'], 'description': edge['description'],
            'evidence': [{'file': item['path'], 'line': item['start_line'],
                          'note': f'Inclusive source lines {item["start_line"]}–{item["end_line"]}.'}
                         for item in edge['evidence']],
            'provenance': 'inferred', 'status': 'existing',
            'x-source-type': edge['type'],
            'x-source-evidence': copy.deepcopy(edge['evidence']),
        })
    result.update({
        'x-graph-id': graph['graph_id'], 'x-variant': graph['variant'],
        'x-scope': copy.deepcopy(graph['scope']),
        'x-source-files': copy.deepcopy(graph['source_files']),
        'x-frozen-prediction': {'file': 'graph.json', 'sha256': digest,
                                'schema-version': graph['schema_version'],
                                'repository': copy.deepcopy(graph['repository'])},
    })
    return result


def validate_format(document):
    schema = json.loads(SCHEMA_PATH.read_text())
    errors = [f'{error.json_path}: {error.message}'
              for error in Draft202012Validator(schema).iter_errors(document)]
    if errors:
        return errors
    groups = document.get('groups', [])
    node_ids = {node['id'] for node in document['nodes']}
    group_ids = {group['id'] for group in groups}
    seen = set()
    identities = [item['id'] for item in groups + document['nodes']]
    identities += [edge.get('id', f'{edge["from"]}--{edge["kind"]}--{edge["to"]}')
                   for edge in document['edges']]
    for identity in identities:
        if identity in seen:
            errors.append(f'duplicate id: {identity}')
        seen.add(identity)
    for node in document['nodes']:
        if 'group' in node and node['group'] not in group_ids:
            errors.append(f'{node["id"]}: unknown group {node["group"]}')
    for edge in document['edges']:
        if edge['from'] not in node_ids or edge['to'] not in node_ids:
            errors.append(f'{edge["from"]}->{edge["to"]}: unknown node')
    parents = {group['id']: group.get('parent') for group in groups}
    for group in groups:
        if 'parent' in group and group['parent'] not in group_ids:
            errors.append(f'{group["id"]}: unknown parent {group["parent"]}')
        path, current = set(), group['id']
        while current in parents:
            if current in path:
                errors.append(f'{group["id"]}: group parent cycle')
                break
            path.add(current)
            current = parents[current]
    return errors


class GraphDumper(yaml.SafeDumper):
    def ignore_aliases(self, data):
        return True

    def increase_indent(self, flow=False, indentless=False):
        return super().increase_indent(flow, False)


def represent_string(dumper, value):
    return dumper.represent_scalar('tag:yaml.org,2002:str', value, style='|' if '\n' in value else None)


GraphDumper.add_representer(str, represent_string)


def serialize(document):
    return yaml.dump(document, Dumper=GraphDumper, sort_keys=False, allow_unicode=True, width=100)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, default=DEFAULT_REPO)
    parser.add_argument('--output', type=Path, default=HERE / 'graph.yaml')
    parser.add_argument('--check', action='store_true', help='validate the existing YAML without rewriting it')
    args = parser.parse_args()
    try:
        raw = (HERE / 'graph.json').read_bytes()
        digest = hashlib.sha256(raw).hexdigest()
        run = json.loads((HERE / 'run.json').read_text())
        if digest != run['artifact_sha256']:
            raise ValueError('frozen graph.json hash differs from the construction run record')
        graph = json.loads(raw)
        errors = validate(graph, args.repo, json.loads((HERE / 'graph.schema.json').read_text()))
        if errors:
            raise ValueError('\n'.join(errors))
        expected = convert(graph, digest)
        text = args.output.read_text() if args.check else serialize(expected)
        document = yaml.safe_load(text)
        errors = validate_format(document)
        if document != expected:
            errors.append('YAML differs from the frozen prediction and its documented format mapping')
        if errors:
            raise ValueError('\n'.join(errors))
        if not args.check:
            args.output.write_text(text, encoding='utf-8')
        print(json.dumps({'valid': True, 'output': str(args.output),
                          'nodes': len(document['nodes']), 'edges': len(document['edges']),
                          'groups': len(document['groups']), 'frozen_graph_sha256': digest,
                          'yaml_sha256': hashlib.sha256(text.encode()).hexdigest()}, indent=2))
        return 0
    except (OSError, ValueError, yaml.YAMLError) as exc:
        print(json.dumps({'valid': False, 'errors': [str(exc)]}, indent=2))
        return 1


if __name__ == '__main__':
    sys.exit(main())
