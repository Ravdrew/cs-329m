// Quality of a finished graph, from the graph and its checkout only: nothing about any benchmark PR is used, so a
// graph can be accepted or rebuilt on these numbers without selecting graphs for how well they cover the answer.
//
//   node tools/llm-only/quality.mjs RUN_DIR [--json]
//
// RUN_DIR is a builder run (graph.yaml and the calcom/ checkout it was built from).
//   scope_coverage     share of in-scope, tracked, non-test source files that belong to some component
//   weak_evidence      share of evidence ranges whose lines are only blank lines, imports, re-exports or comments
//   single_file_nodes  share of components that list one file
// verdict: 'ok' or 'rebuild' with reasons, against THRESHOLDS below.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseYaml, SOURCE_FILE, TEST_FILE } from './graph.mjs';
import { git } from './source.mjs';

// Out of scope per tools/prompts/shared-core-wide.md (API v1/v2, platform SDK and atoms, enterprise-only features,
// marketing and example apps, generic UI primitives, build tooling), plus the per-app integrations the prompt says to
// represent by their family rather than one component per app.
const OUT_OF_SCOPE = [
  /^apps\/(api|website|ai|console|swagger|storybook|docs)\//, /^packages\/platform\//, /^packages\/(features\/)?ee\//,
  /^packages\/ui\//, /^packages\/(config|tsconfig|eslint-plugin|eslint-config|dayjs|debugging)\//, /^example-apps\//,
  /^packages\/app-store\/(?!_utils\/|_lib\/|_components\/|_pages\/|components\/|utils\/|server\/|[^/]+\.[cm]?[jt]sx?$)/,
  /(^|\/)(scripts|playwright|cypress)\//, /\.d\.ts$/, /\.(config|setup)\.[cm]?[jt]s$/,
];
/** A tracked path the wide scope asks the graph to cover (non-test source under apps/ or packages/, not out of scope). */
export const inScope = p => SOURCE_FILE.test(p) && !TEST_FILE.test(p) && /^(apps|packages)\//.test(p) && !OUT_OF_SCOPE.some(r => r.test(p));
export const THRESHOLDS = Object.freeze({ min_scope_coverage: 0.2, max_weak_evidence: 0.25, max_single_file_nodes: 0.5 });

const WEAK_LINE = /^\s*($|\/\/|\/\*|\*|\*\/|import\b|export\s+(\*|\{[^}]*\})\s+from\b|export\s+type\s+\{|["']use (client|server)["'];?$|\}\s*from\s+["'])/;

export function quality(runDir) {
  const graph = parseYaml(readFileSync(join(runDir, 'graph.yaml'), 'utf8'));
  const checkout = join(runDir, 'calcom');
  const tracked = git(checkout, ['ls-tree', '-r', '--name-only', '--full-tree', graph.commit]).split('\n').filter(Boolean);
  const scoped = tracked.filter(inScope);
  const owned = new Set(graph.nodes.flatMap(n => (n.files ?? []).map(f => (typeof f === 'string' ? f : f.path))));
  const covered = scoped.filter(p => owned.has(p));
  const lines = new Map();
  const fileLines = path => {
    if (!lines.has(path)) { try { lines.set(path, readFileSync(join(checkout, path), 'utf8').split('\n')); } catch { lines.set(path, []); } }
    return lines.get(path);
  };
  let ranges = 0, weak = 0;
  for (const item of [...graph.nodes, ...graph.edges]) {
    for (const e of item['x-source-evidence'] ?? []) {
      ranges++;
      const text = fileLines(e.path).slice(e.start_line - 1, e.end_line);
      if (text.every(l => WEAK_LINE.test(l))) weak++;
    }
  }
  const fileCounts = graph.nodes.map(n => (n.files ?? []).length).sort((a, b) => a - b);
  const round = x => Math.round(x * 1000) / 1000;
  const metrics = {
    commit: graph.commit, nodes: graph.nodes.length, edges: graph.edges.length, groups: graph.groups.length,
    owned_files: owned.size, in_scope_files: scoped.length, scope_coverage: round(covered.length / scoped.length),
    evidence_ranges: ranges, weak_evidence: round(weak / Math.max(ranges, 1)),
    single_file_nodes: round(fileCounts.filter(c => c === 1).length / Math.max(fileCounts.length, 1)),
    median_files_per_node: fileCounts[Math.floor(fileCounts.length / 2)] ?? 0,
  };
  const reasons = [];
  if (metrics.scope_coverage < THRESHOLDS.min_scope_coverage) reasons.push(`scope coverage ${metrics.scope_coverage} < ${THRESHOLDS.min_scope_coverage}`);
  if (metrics.weak_evidence > THRESHOLDS.max_weak_evidence) reasons.push(`weak evidence ${metrics.weak_evidence} > ${THRESHOLDS.max_weak_evidence}`);
  if (metrics.single_file_nodes > THRESHOLDS.max_single_file_nodes) reasons.push(`single-file components ${metrics.single_file_nodes} > ${THRESHOLDS.max_single_file_nodes}`);
  return { ...metrics, verdict: reasons.length ? 'rebuild' : 'ok', reasons };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const runDir = process.argv[2];
  if (!runDir) { console.error('Usage: node quality.mjs RUN_DIR [--json]'); process.exit(2); }
  const q = quality(runDir);
  console.log(process.argv.includes('--json') ? JSON.stringify(q) : Object.entries(q).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join('; ') || '-' : v}`).join('\n'));
}
