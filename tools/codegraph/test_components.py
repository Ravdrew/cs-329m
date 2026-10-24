import copy
import tempfile
import unittest
from pathlib import Path

from components import aggregate_edges, build, component_id, excluded, lean_edges, partition


class ComponentGraphTests(unittest.TestCase):
    def test_partition_preserves_unique_ownership_and_budget(self):
        files = {"packages/features/bookings/a.ts", "packages/features/bookings/b.ts",
                 "packages/features/auth/a.ts", "packages/features/auth/b.ts",
                 "packages/features/shared.ts", "apps/web/index.ts"}
        config = {"components": 3, "split_roots": ["packages/features"], "min_component_files": 2}
        owners = partition(files, config)
        self.assertEqual(set(owners), files)
        self.assertEqual(len(set(owners.values())), 3)
        # Ties are broken by path, not unordered set iteration.
        self.assertEqual(owners["packages/features/auth/a.ts"], "packages/features/auth")
        self.assertEqual(owners["packages/features/bookings/a.ts"], "packages/features")
        self.assertEqual(owners, partition(set(reversed(sorted(files))), config))

    def test_budget_does_not_silently_merge_unrelated_packages(self):
        with self.assertRaisesRegex(ValueError, "exceed component budget"):
            partition({"apps/a/a.ts", "apps/b/b.ts"}, {"components": 1})

    def test_ids_distinguish_path_collisions(self):
        self.assertNotEqual(component_id("packages/a-b"), component_id("packages/a/b"))
        self.assertNotEqual(component_id("packages/ABC"), component_id("packages/abc"))

    def test_excludes_tests_without_excluding_production_test_named_features(self):
        for p in ["a/foo.test.ts", "a/foo.integration-test.ts", "a/foo.e2e-spec.ts",
                  "a/__tests__/x.ts", "apps/web/playwright/x.ts", "a/foo.stories.tsx"]:
            self.assertTrue(excluded(p), p)
        self.assertFalse(excluded("packages/features/testing-policy/service.ts"))

    def test_aggregation_preserves_direction_and_evidence_and_filters_noise(self):
        symbols = {"a": {"file_path": "a.ts", "name": "caller"},
                   "b": {"file_path": "b.ts", "name": "callee"},
                   "c": {"file_path": "c.ts", "name": "helper"},
                   "t": {"file_path": "x.test.ts", "name": "test"}}
        owners = {"a.ts": "alpha", "b.ts": "beta", "c.ts": "alpha"}
        def edge(source="a", target="b", kind="calls", line=5, metadata=None):
            return dict(source=source, target=target, kind=kind, line=line, metadata=metadata)
        edges, stats = aggregate_edges([
            edge(), edge(line=7), edge(source="b", target="a", kind="imports", line=None),
            edge(target="c"), edge(source="t"), edge(kind="contains"),
            edge(metadata='{"confidence":0.5}'), edge(metadata='{"confidence":0.8}')
        ], symbols, owners, 0.8)
        self.assertEqual(len(edges), 2)
        forward = next(e for e in edges if e["kind"] == "calls")
        self.assertEqual(forward["from"], component_id("alpha"))
        self.assertEqual(forward["to"], component_id("beta"))
        self.assertEqual(forward["x-codegraph"]["raw_edge_count"], 3)
        self.assertEqual(forward["x-codegraph"]["file_pair_count"], 1)
        self.assertEqual(forward["evidence"][0]["line"], 5)
        self.assertNotIn("line", next(e for e in edges if e["kind"] == "uses")["evidence"][0])
        self.assertEqual(stats["low_confidence"], 1)
        self.assertEqual(stats["raw_edges"], sum(v for k, v in stats.items() if k != "raw_edges"))

    def test_lean_filter_preserves_incoming_link_without_inventing_edges(self):
        def edge(id, source, target, pairs):
            return {"id": id, "from": source, "to": target,
                    "x-codegraph": {"file_pair_count": pairs, "raw_edge_count": pairs}}
        edges = [edge("ab", "a", "b", 10), edge("ac", "a", "c", 5),
                 edge("ad", "a", "d", 1), edge("cb", "c", "b", 3)]
        before = copy.deepcopy(edges)
        selected = lean_edges(edges, top_k=1, min_pairs=2)
        self.assertEqual({e["id"] for e in selected}, {"ab", "ac", "cb"})
        self.assertEqual(edges, before)

    def test_missing_index_is_not_created(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(ValueError, "Missing CodeGraph index"):
                build(Path(directory), {})
            self.assertEqual(list(Path(directory).iterdir()), [])


if __name__ == "__main__":
    unittest.main()
