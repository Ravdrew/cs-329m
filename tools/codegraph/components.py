#!/usr/bin/env python3
"""Coarsen CodeGraph's SQLite index into reproducible component graphs.

Uses only the Python standard library. Never modifies the source index.
"""
import argparse
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import re
import sqlite3
import subprocess
import sys

HERE = Path(__file__).resolve().parent
EDGE_KINDS = {"calls": "calls", "navigates": "navigates", "imports": "uses",
              "references": "uses", "instantiates": "uses", "extends": "uses",
              "implements": "uses", "decorates": "uses"}
TEST_DIRS = {"test", "tests", "__tests__", "__mocks__", "fixtures", "__fixtures__",
             "playwright", "e2e", "test-utils", "test-helpers"}


def excluded(path):
    parts = Path(path).parts
    name = parts[-1]
    return (bool(TEST_DIRS.intersection(parts))
            or bool(re.search(r"\.(test|spec|stories|e2e-spec|integration-test)\.", name))
            or name.startswith(("test-setup.", "vitest.", "jest.")))


def base_component(path):
    parts = path.split("/")
    if len(parts) >= 3 and parts[0] in {"apps", "packages", "example-apps"}:
        return "/".join(parts[:2])
    return "repository"


def component_id(path):
    slug = re.sub(r"[^a-z0-9._-]+", "-", path.lower()).strip("-")
    # Hash disambiguates case-sensitive paths and slash/hyphen collisions.
    return slug + "-" + hashlib.sha256(path.encode()).hexdigest()[:8]


def partition(files, config):
    """Preserve package/app boundaries; promote largest configured subdirectories."""
    owners = {p: base_component(p) for p in sorted(files)}
    base_count = len(set(owners.values()))
    target = config["components"]
    if target < base_count:
        raise ValueError(f"{base_count} package/app boundaries exceed component budget {target}")
    candidates = defaultdict(set)
    for root in config["split_roots"]:
        prefix = root.rstrip("/") + "/"
        for path in files:
            if path.startswith(prefix):
                tail = path[len(prefix):]
                if "/" in tail:
                    candidates[prefix + tail.split("/")[0]].add(path)
    # Largest source-bearing subdirectories get their own node first.
    for candidate, members in sorted(candidates.items(), key=lambda x: (-len(x[1]), x[0])):
        if len(members) < config["min_component_files"]:
            continue
        trial = dict(owners)
        for path in members:
            trial[path] = candidate
        if len(set(trial.values())) <= target:
            owners = trial
    return owners


def describe(path):
    if path == "repository":
        return "Repository tooling", "other", "tooling"
    if path.startswith("apps/"):
        kind = "endpoint" if path.startswith("apps/api") else "component"
        return path.removeprefix("apps/").replace("/src/", "/"), kind, "applications"
    if path.startswith("packages/features/"):
        return "Features / " + path.rsplit("/", 1)[-1], "service", "features"
    if path == "packages/features":
        return "Features / shared & smaller modules", "service", "features"
    kind = "store" if path in {"packages/prisma", "packages/kysely"} else "service"
    if path in {"packages/ui", "packages/coss-ui"} or path.startswith("packages/platform/atoms"):
        kind = "component"
    return path.removeprefix("packages/"), kind, "packages"


def make_nodes(owners, symbols):
    files = defaultdict(list)
    counts = Counter()
    for path, owner in owners.items():
        files[owner].append(path)
    for symbol in symbols.values():
        if symbol["file_path"] in owners:
            counts[owners[symbol["file_path"]]] += 1
    nodes = []
    for path in sorted(files):
        label, kind, group = describe(path)
        nodes.append({"id": component_id(path), "label": label, "kind": kind, "group": group,
                      "files": sorted(files[path]), "provenance": "inferred",
                      "summary": f"{len(files[path])} indexed non-test files; boundary: {path}.",
                      "description": "Inferred from repository directory boundaries. "
                                     "Files assigned to a more specific component are excluded.",
                      "x-codegraph": {"boundary": path, "file_count": len(files[path]),
                                      "structural_node_count": counts[path]}})
    return nodes


def aggregate_edges(rows, symbols, owners, min_confidence):
    buckets = {}
    stats = Counter()
    for row in rows:
        stats["raw_edges"] += 1
        kind = row["kind"]
        if kind not in EDGE_KINDS:
            stats["containment_or_unsupported"] += 1
            continue
        source, target = symbols.get(row["source"]), symbols.get(row["target"])
        if not source or not target:
            stats["missing_endpoints"] += 1
            continue
        sf, tf = source["file_path"], target["file_path"]
        if sf not in owners or tf not in owners:
            stats["excluded_file_edges"] += 1
            continue
        a, b = owners[sf], owners[tf]
        if a == b:
            stats["within_component"] += 1
            continue
        metadata = json.loads(row["metadata"] or "{}")
        confidence = metadata.get("confidence")
        if confidence is not None and confidence < min_confidence:
            stats["low_confidence"] += 1
            continue
        stats["accepted_cross_component"] += 1
        key = (a, b, EDGE_KINDS[kind])
        bucket = buckets.setdefault(key, {"raw_kinds": Counter(), "pairs": set(),
                                           "sites": set(), "unknown_confidence": 0})
        bucket["raw_kinds"][kind] += 1
        bucket["pairs"].add((sf, tf))
        # A missing location is not replaced with the declaration's start line.
        bucket["sites"].add((sf, row["line"] or 0, source["name"], tf, target["name"], kind))
        bucket["unknown_confidence"] += confidence is None
    edges = []
    for (a, b, kind), bucket in sorted(buckets.items()):
        pair_count = len(bucket["pairs"])
        evidence = []
        # Prefer distinct source files so examples aren't all from a single call site.
        sites = sorted(bucket["sites"])
        chosen = []
        seen_files = set()
        for site in sites:
            if site[0] not in seen_files:
                chosen.append(site)
                seen_files.add(site[0])
            if len(chosen) == 3:
                break
        for sf, line, symbol, tf, target, raw_kind in chosen:
            item = {"file": sf, "symbol": symbol,
                    "note": f"CodeGraph {raw_kind} → {target} ({tf})"}
            if line > 0:
                item["line"] = line
            evidence.append(item)
        source_id, target_id = component_id(a), component_id(b)
        edges.append({"id": f"{source_id}--{kind}--{target_id}", "from": source_id,
                      "to": target_id, "kind": kind, "provenance": "extracted",
                      "label": f"{kind} · {pair_count} file pairs", "evidence": evidence,
                      "x-codegraph": {"file_pair_count": pair_count,
                                      "raw_edge_count": sum(bucket["raw_kinds"].values()),
                                      "raw_kinds": dict(sorted(bucket["raw_kinds"].items())),
                                      "unknown_confidence_count": bucket["unknown_confidence"]}})
    return edges, dict(sorted(stats.items()))


def lean_edges(edges, top_k, min_pairs):
    """Top K outgoing dependencies plus strongest incoming edge per component.

    All choices use distinct file pairs, not repeated call-site counts. Does not
    synthesize bridges or treat pruned relationships as absent in the full graph.
    """
    def rank(e):
        return (-e["x-codegraph"]["file_pair_count"],
                -e["x-codegraph"]["raw_edge_count"], e["id"])
    eligible = [e for e in edges if e["x-codegraph"]["file_pair_count"] >= min_pairs]
    outgoing, incoming = defaultdict(list), defaultdict(list)
    for edge in eligible:
        outgoing[edge["from"]].append(edge)
        incoming[edge["to"]].append(edge)
    selected = set()
    for values in outgoing.values():
        selected.update(e["id"] for e in sorted(values, key=rank)[:top_k])
    for values in incoming.values():
        selected.add(sorted(values, key=rank)[0]["id"])
    return [edge for edge in edges if edge["id"] in selected]


def git(project, *args):
    return subprocess.check_output(["git", "-C", str(project), *args], text=True).strip()


def build(project, config):
    db = project / ".codegraph/codegraph.db"
    if not db.is_file():
        raise ValueError(f"Missing CodeGraph index: {db}; run codegraph init first")
    conn = sqlite3.connect(db.resolve().as_uri() + "?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("BEGIN")  # One consistent read snapshot, even if a writer is active.
        metadata = dict(conn.execute("SELECT key,value FROM project_metadata"))
        commit = git(project, "rev-parse", "HEAD")
        if metadata.get("index_state") != "complete":
            raise ValueError("CodeGraph index is incomplete; rebuild it before exporting")
        if metadata.get("indexed_at_commit") != commit:
            raise ValueError("Checkout and index commits differ; rebuild the index first")
        if git(project, "status", "--porcelain", "--untracked-files=no"):
            raise ValueError("Tracked source changes exist; use a clean pinned checkout")
        dirty = json.loads(metadata.get("indexed_dirty_paths", "{}"))
        if dirty.get("paths"):
            raise ValueError("Index was built from modified sources; rebuild from a clean checkout")
        symbols = {row["id"]: dict(row) for row in conn.execute(
            "SELECT id,kind,name,file_path FROM nodes ORDER BY id")}
        indexed = {row[0] for row in conn.execute("SELECT path FROM files")}
        indexed.update(s["file_path"] for s in symbols.values())
        tracked = set(git(project, "ls-files").splitlines())
        missing = indexed - tracked
        if missing:
            raise ValueError(f"Index contains {len(missing)} untracked/deleted files; rebuild it")
        omitted = sorted(p for p in indexed if excluded(p))
        owners = partition(indexed - set(omitted), config)
        nodes = make_nodes(owners, symbols)
        edges, edge_stats = aggregate_edges(conn.execute("SELECT * FROM edges ORDER BY id"),
                                            symbols, owners, config["min_confidence"])
    finally:
        conn.close()
    lean = lean_edges(edges, config["top_dependencies"], config["min_file_pairs"])
    connected = {e[k] for e in lean for k in ("from", "to")}
    report = {"repo": config["repo"], "commit": commit, "codegraph_version": metadata.get("indexed_with_version"),
              "extraction_version": metadata.get("indexed_with_extraction_version"),
              "config": config, "structural_nodes": len(symbols), "indexed_files": len(indexed),
              "assigned_files": len(owners), "excluded_test_files": omitted,
              "tracked_but_unindexed_files": sorted(tracked - indexed),
              "components": len(nodes), "full_component_edges": len(edges), "lean_edges": len(lean),
              "omitted_from_lean": len(edges) - len(lean), "edge_accounting": edge_stats,
              "isolated_in_lean": [n["id"] for n in nodes if n["id"] not in connected],
              "limitations": ["Directory-based inferred boundaries; not a semantic ground truth.",
                              "Only CodeGraph-indexed files and resolved relationships are represented.",
                              "Unindexed assets, Prisma models, dynamic calls and external services may be missing.",
                              "Tests are excluded. Missing confidence is retained and counted, not assumed certain.",
                              "Lean graph prunes weak links; use full graph for completeness-sensitive scoring."]}
    base = {"version": 1, "repo": config["repo"], "commit": commit, "title": config["title"],
            "description": "Directory-based component projection of the CodeGraph structural index. "
                           "Edges are observed dependencies, not inferred business workflows.",
            "groups": [{"id": k, "label": v} for k, v in [
                ("applications", "Applications"), ("features", "Feature services"),
                ("packages", "Shared packages"), ("tooling", "Repository tooling")]],
            "nodes": nodes,
            "x-codegraph": {"version": report["codegraph_version"], "config": config}}
    full = dict(base, edges=edges)
    graph = dict(base, edges=lean)
    graph["x-codegraph"] = dict(base["x-codegraph"], projection="lean", omitted_edges=len(edges)-len(lean))
    full["x-codegraph"] = dict(base["x-codegraph"], projection="full")
    return graph, full, report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", type=Path, help="Indexed source repository")
    parser.add_argument("--config", type=Path, default=HERE / "components.config.json")
    parser.add_argument("--out", type=Path, required=True, help="Output directory")
    parser.add_argument("--components", type=int, help="Maximum component count")
    parser.add_argument("--top-dependencies", type=int, help="Outgoing edges per component in lean view")
    args = parser.parse_args()
    try:
        config = json.loads(args.config.read_text())
        if args.components is not None:
            config["components"] = args.components
        if args.top_dependencies is not None:
            config["top_dependencies"] = args.top_dependencies
        for key in ("components", "min_component_files", "top_dependencies", "min_file_pairs"):
            if not isinstance(config[key], int) or config[key] < 1:
                raise ValueError(f"{key} must be a positive integer")
        if not 0 <= config["min_confidence"] <= 1:
            raise ValueError("min_confidence must be between 0 and 1")
        graph, full, report = build(args.path.resolve(), config)
        args.out.mkdir(parents=True, exist_ok=True)
        for name, value in [("components.json", graph), ("components.full.json", full),
                            ("components.report.json", report)]:
            (args.out / name).write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")
        print(f"Built {len(graph['nodes'])} components, {len(graph['edges'])} lean edges "
              f"({len(full['edges'])} before pruning) from {report['assigned_files']} files.")
        print(f"Output: {args.out.resolve()}")
    except (ValueError, sqlite3.Error, OSError, subprocess.CalledProcessError) as exc:
        parser.exit(1, f"error: {exc}\n")


if __name__ == "__main__":
    main()
