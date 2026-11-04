"""Check format compatibility and preservation of the frozen prediction."""
import copy
import hashlib
import json
from pathlib import Path
import unittest

import yaml

from export_graph import EDGE_KINDS, NODE_KINDS, convert, serialize, validate_format

HERE = Path(__file__).resolve().parent


class GraphExportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        raw = (HERE / 'graph.json').read_bytes()
        cls.frozen = json.loads(raw)
        cls.digest = hashlib.sha256(raw).hexdigest()
        cls.exported = convert(cls.frozen, cls.digest)

    def setUp(self):
        self.graph = copy.deepcopy(self.exported)

    def errors(self):
        return '\n'.join(validate_format(self.graph))

    def test_export_matches_shared_schema(self):
        self.assertEqual(self.errors(), '')

    def test_checked_in_yaml_matches_frozen_prediction(self):
        self.assertEqual(yaml.safe_load((HERE / 'graph.yaml').read_text()), self.exported)

    def test_yaml_roundtrip_preserves_all_values(self):
        self.assertEqual(yaml.safe_load(serialize(self.exported)), self.exported)

    def test_all_components_membership_and_evidence_are_preserved(self):
        self.assertEqual(len(self.graph['nodes']), len(self.frozen['nodes']))
        group_labels = {group['id']: group['label'] for group in self.graph['groups']}
        for old, new in zip(self.frozen['nodes'], self.graph['nodes']):
            for key in ('id', 'label', 'files'):
                self.assertEqual(new[key], old[key])
            self.assertEqual(new['kind'], NODE_KINDS[old['type']])
            self.assertEqual(new['description'], old['summary'])
            self.assertEqual(new['x-source-evidence'], old['evidence'])
            self.assertEqual(group_labels[new['group']], old['group'])

    def test_relationships_and_exact_evidence_are_preserved(self):
        self.assertEqual(len(self.graph['edges']), len(self.frozen['edges']))
        for old, new in zip(self.frozen['edges'], self.graph['edges']):
            self.assertEqual((new['id'], new['from'], new['to']), (old['id'], old['source'], old['target']))
            self.assertEqual(new['kind'], EDGE_KINDS.get(old['type'], old['type']))
            for key in ('label', 'description'):
                self.assertEqual(new[key], old[key])
            self.assertEqual(new['x-source-evidence'], old['evidence'])
            self.assertEqual([(item['file'], item['line']) for item in new['evidence']],
                             [(item['path'], item['start_line']) for item in old['evidence']])

    def test_commit_scope_hashes_and_existing_inferred_status(self):
        self.assertEqual(self.graph['commit'], self.frozen['repository']['commit'])
        self.assertEqual(self.graph['x-scope'], self.frozen['scope'])
        self.assertEqual(self.graph['x-source-files'], self.frozen['source_files'])
        self.assertEqual(self.graph['x-frozen-prediction']['sha256'], self.digest)
        for item in self.graph['nodes'] + self.graph['edges']:
            self.assertEqual((item['provenance'], item['status']), ('inferred', 'existing'))

    def test_routes_come_from_frozen_scope(self):
        routes = {route for node in self.graph['nodes'] for route in node.get('routes', [])}
        self.assertEqual(routes, set(self.frozen['scope']['entrypoints']))

    def test_duplicate_ids_are_rejected_in_each_collection(self):
        for key in ('groups', 'nodes', 'edges'):
            with self.subTest(key=key):
                graph = copy.deepcopy(self.exported)
                graph[key].append(copy.deepcopy(graph[key][0]))
                self.assertIn('duplicate id', '\n'.join(validate_format(graph)))

    def test_missing_references_are_rejected(self):
        self.graph['nodes'][0]['group'] = 'missing-group'
        self.graph['edges'][0]['to'] = 'missing-node'
        self.graph['groups'][0]['parent'] = 'missing-parent'
        errors = self.errors()
        for expected in ('unknown group', 'unknown node', 'unknown parent'):
            self.assertIn(expected, errors)

    def test_group_parent_cycles_are_rejected(self):
        first, second = self.graph['groups'][:2]
        first['parent'], second['parent'] = second['id'], first['id']
        self.assertIn('group parent cycle', self.errors())

    def test_unknown_fields_rejected_and_extensions_allowed(self):
        for item in (self.graph, self.graph['nodes'][0], self.graph['edges'][0], self.graph['groups'][0]):
            item['x-experiment'] = {'arbitrary': 'extension data'}
        self.assertEqual(self.errors(), '')
        self.graph['nodes'][0]['position'] = {'x': 1, 'y': 2}
        self.assertIn('position', self.errors())

    def test_evidence_does_not_accept_extension_fields(self):
        self.graph['edges'][0]['evidence'][0]['x-excerpt'] = 'unsupported here'
        self.assertIn('x-excerpt', self.errors())

    def test_invalid_kind_provenance_and_status_are_rejected(self):
        self.graph['nodes'][0].update(kind='route', provenance='llm', status='unchanged')
        errors = self.errors()
        for expected in ('route', 'llm', 'unchanged'):
            self.assertIn(expected, errors)


if __name__ == '__main__':
    unittest.main()
