"""Regression checks for invalid provenance and graph structures."""
import copy
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from validate_graph import DEFAULT_REPO, validate

HERE = Path(__file__).resolve().parent


class GraphValidationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.baseline = json.loads((HERE / 'graph.json').read_text())
        cls.schema = json.loads((HERE / 'graph.schema.json').read_text())
        cls.repo = DEFAULT_REPO

    def setUp(self):
        self.graph = copy.deepcopy(self.baseline)

    def errors(self):
        return '\n'.join(validate(self.graph, self.repo, self.schema))

    def test_pinned_graph_passes(self):
        self.assertEqual(self.errors(), '')

    def test_dangling_endpoint(self):
        self.graph['edges'][0]['target'] = 'nonexistent'
        self.assertIn('dangling endpoint', self.errors())

    def test_duplicate_node(self):
        self.graph['nodes'].append(copy.deepcopy(self.graph['nodes'][0]))
        self.assertIn('duplicate node ID', self.errors())

    def test_duplicate_relationship_even_with_new_id(self):
        edge = copy.deepcopy(self.graph['edges'][0])
        edge['id'] = 'different-id'
        self.graph['edges'].append(edge)
        self.assertIn('duplicate edge relationship', self.errors())

    def test_stale_excerpt(self):
        self.graph['edges'][0]['evidence'][0]['excerpt'] = 'invented call();'
        self.assertIn('evidence excerpt mismatch', self.errors())

    def test_impossible_line_range(self):
        self.graph['edges'][0]['evidence'][0]['end_line'] = 10000000
        self.assertIn('invalid evidence line range', self.errors())

    def test_empty_provenance(self):
        self.graph['nodes'][0]['evidence'] = []
        self.assertIn('too few items', self.errors())

    def test_unproven_member_file(self):
        self.graph['nodes'][0]['files'].append('unproven.ts')
        self.assertIn('every member file needs node evidence', self.errors())

    def test_source_hash_mismatch(self):
        path = next(iter(self.graph['source_files']))
        self.graph['source_files'][path] = '0' * 64
        self.assertIn('source hash mismatch', self.errors())

    def test_wrong_commit(self):
        self.graph['repository']['commit'] = '0' * 40
        self.assertIn('checkout commit differs', self.errors())

    def test_path_traversal(self):
        self.graph['source_files']['../outside.ts'] = '0' * 64
        self.assertIn('unsafe source path', self.errors())

    def test_non_source_artifact_cannot_be_evidence(self):
        self.graph['source_files']['experiments/llm-only/graph.json'] = '0' * 64
        self.assertIn('not tracked at pinned commit', self.errors())

    def test_unknown_relationship(self):
        self.graph['edges'][0]['type'] = 'guesses'
        self.assertIn('unknown value', self.errors())

    def test_unexpected_fields(self):
        self.graph['nodes'][0]['unreviewed_field'] = True
        self.assertIn('unexpected unreviewed_field', self.errors())

    def test_boolean_line_number_is_not_integer(self):
        self.graph['nodes'][0]['evidence'][0]['start_line'] = True
        self.assertIn('expected integer', self.errors())

    def test_wrong_relationship_target_type(self):
        self.graph['edges'][0]['type'] = 'reads'
        self.assertIn('incompatible relationship target type', self.errors())

    def test_cli_rejects_malformed_shape_without_traceback(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'bad.json'
            for payload in ([], {'nodes': 42}, None):
                path.write_text(json.dumps(payload))
                result = subprocess.run([sys.executable, str(HERE / 'validate_graph.py'), '--graph', str(path)],
                                        text=True, capture_output=True)
                self.assertEqual(result.returncode, 1)
                self.assertFalse(json.loads(result.stdout)['valid'])
                self.assertNotIn('Traceback', result.stderr)


if __name__ == '__main__':
    unittest.main()
