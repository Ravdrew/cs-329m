import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkPi, DEFAULT_MODEL, DEFAULT_PROVIDER, executePi } from './pi.mjs';
import { DraftGraph, parseYaml, yaml } from './graph.mjs';
import { StaticGraph, prepareStatic, canonical } from './static.mjs';
import { runPolicy } from './source-server.mjs';
import { assertOutsideRepository, git, prepareCheckout, sha256, Source } from './source.mjs';

export const HERE = dirname(fileURLToPath(import.meta.url));
export const TEAM_ROOT = resolve(HERE, '../..');
const json = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
export function targetConfig() {
  const text = readFileSync(join(TEAM_ROOT, 'targets/calcom.env'), 'utf8');
  const value = key => text.match(new RegExp(`^${key}=(.+)$`, 'm'))?.[1];
  return { remote: value('CALCOM_REPO'), commit: value('CALCOM_SHA'), repo: 'calcom/cal.com' };
}

export function verifyRun(runDir) {
  const config = JSON.parse(readFileSync(join(runDir, 'server.json'), 'utf8'));
  const source = new Source(config.checkout, config.commit);
  const schema = JSON.parse(readFileSync(join(runDir, 'schema.json'), 'utf8'));
  const inputBytes = readFileSync(join(runDir, 'static-input.json'));
  if (sha256(inputBytes) !== config.staticInputHash) throw new Error('Static input checksum mismatch');
  const input = JSON.parse(inputBytes);
  if (input.repo !== config.repo || input.commit !== config.commit) throw new Error('Static input pin mismatch');
  // Runs recorded before the graph policy have none in server.json and replay without it.
  const draft = new DraftGraph(source, schema, config.repo, new StaticGraph(input), config.staticInputHash, { policy: runPolicy(config) });
  const events = readFileSync(join(runDir, 'tools.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
  let frozen;
  for (const event of events) {
    if (event.event !== 'tool_result') continue;
    if (frozen) throw new Error('Successful tool calls occurred after finalization');
    if (event.name === 'read_source') {
      const actual = source.read(event.args);
      if (canonical(actual) !== canonical(event.result)) throw new Error('Read transcript differs from pinned source');
    }
    if (event.name === 'update_graph') draft.update(event.args.yaml, event.args.remove_ids);
    if (event.name === 'update_edges') draft.updateEdges(event.args.yaml);
    if (event.name === 'finalize_graph') frozen = draft.finalize();
  }
  if (!frozen) throw new Error('Transcript did not finalize a graph');
  const content = readFileSync(join(runDir, 'graph.yaml'), 'utf8');
  const document = parseYaml(content);
  if (document.commit !== config.commit || document.repo !== config.repo || document['x-variant'] !== 'codegraph-llm') throw new Error('Graph header differs from run configuration');
  const verified = frozen;
  if (yaml(verified) !== content) throw new Error('Frozen YAML/evidence/hashes differ from validated canonical output');
  for (const [file, actual] of [['graph.json', canonical(verified)], ['components.yaml', yaml(draft.document)],
    ['membership.json', canonical(draft.membership)], ['aggregation.json', canonical(draft.aggregation)]]) {
    if (readFileSync(join(runDir, file), 'utf8') !== actual) throw new Error(`${file} differs from replayed model decisions/static aggregation`);
  }
  const report = JSON.parse(readFileSync(join(runDir, 'validation.json'), 'utf8'));
  // Runs recorded before edge operations existed have no edge-ops.yaml and no edge_ops field.
  // They verify as before, provided the transcript contains no edge operations.
  const legacy = report.edge_ops === undefined;
  if (legacy && (existsSync(join(runDir, 'edge-ops.yaml')) || draft.edgeOps.length)) throw new Error('Run predates edge operations but contains them');
  if (!legacy && readFileSync(join(runDir, 'edge-ops.yaml'), 'utf8') !== yaml(draft.edgeOps)) throw new Error('edge-ops.yaml differs from replayed model decisions/static aggregation');
  if (report.graph_sha256 !== sha256(content)) throw new Error('Frozen graph checksum mismatch');
  if (report.valid !== true || report.commit !== config.commit || report.nodes !== verified.nodes.length ||
      report.edges !== verified.edges.length || report.groups !== verified.groups.length ||
      (!legacy && (report.host_edges !== Object.keys(draft.aggregation.host_edges ?? draft.aggregation.edges).length || report.edge_ops !== draft.edgeOps.length)) ||
      report.source_files !== verified['x-source-files'].length || report.static_input_sha256 !== config.staticInputHash ||
      report.membership_sha256 !== verified['x-codegraph'].membership_sha256 ||
      report.aggregation_sha256 !== verified['x-codegraph'].aggregation_sha256 ||
      canonical(report.static_edge_accounting) !== canonical(draft.aggregation.counts) ||
      canonical(report.edge_review ?? null) !== canonical(verified['x-codegraph'].edge_review ?? null) ||
      (report.dropped_edges ?? null) !== (verified['x-codegraph'].dropped_edges?.length ?? null)) throw new Error('Validation report differs from the graph');
  return report;
}

// The default for new runs: one host edge per component pair; the model must classify every pair (kind, label,
// description) or drop it with a reason, and may cite an edge's own static code sites as evidence for its kind; above
// 20 components every component needs a group. `optional` is PR #9 as
// first written: edge operations allowed, nothing required.
export const REQUIRED_POLICY = Object.freeze({ edgeReview: { min_file_pairs: 0, labels: true }, pairEdges: true, edgeDrop: true, groups: { min_nodes: 20, min_groups: 3 }, staticSites: true, kindHints: true, autoDrop: { max_file_pairs: 2 } });
export const POLICIES = { required: REQUIRED_POLICY, optional: {} };

export async function runExperiment(options, dependencies = {}) {
  const started = Date.now();
  const target = dependencies.target ?? targetConfig();
  const outputRoot = resolve(options.outputRoot ?? join(TEAM_ROOT, '..', 'codegraph-llm-runs'));
  mkdirSync(outputRoot, { recursive: true });
  assertOutsideRepository(outputRoot, TEAM_ROOT);
  const runDir = mkdtempSync(join(realpathSync(outputRoot), `${new Date().toISOString().replaceAll(':', '-')}-`));
  const config = {
    ...target, runDir, checkout: join(runDir, 'calcom'), model: options.model ?? DEFAULT_MODEL,
    provider: options.provider ?? DEFAULT_PROVIDER, effort: options.effort ?? 'medium',
    authFile: options.authFile ? resolve(options.authFile) : null,
    maxTools: options.maxTools ?? 600, maxMinutes: options.maxMinutes ?? 45,
    policy: options.policy ?? REQUIRED_POLICY,
  };
  const metadata = {
    version: 1, variant: 'codegraph-llm', backend: 'pi-sdk', status: 'preparing', started_at: new Date(started).toISOString(),
    target, run_directory: runDir, provider: config.provider, model: config.model, reasoning_effort: config.effort,
    limits: { max_tool_calls: config.maxTools, max_minutes: config.maxMinutes },
    isolation: { fresh_session: true, fresh_checkout: true, source_access: 'tracked-regular-files-only custom tools', shell: false, web: false, plugins: false, static_graph_supplied: true, prior_component_graphs_supplied: false, inherited_project_instructions: false, os_container: false },
    edge_policy: config.policy.edgeReview
      ? `one host edge per component pair; the model must classify every pair linked through more than ${config.policy.edgeReview.min_file_pairs} file pairs (kind, label, description) or drop it with a reason; never add or re-point`
      : 'host-aggregated static edges; model may retype or consolidate them, never add, delete or re-point',
    graph_policy: config.policy,
    usage: null, cost_usd: null, estimated_cost_usd: null, graph_sha256: null,
  };
  const report = () => json(join(runDir, 'run.json'), metadata);
  report();
  options.progress?.({ run_directory: runDir, stage: 'preparing' });
  try {
    if (!options.prepareOnly) {
      metadata.pi = await (dependencies.checkPi ?? checkPi)(config);
    }
    const source = prepareCheckout({ directory: config.checkout, ...target, source: options.source ? resolve(options.source) : target.remote });
    const staticInput = prepareStatic(resolve(options.staticGraph ?? join(TEAM_ROOT, 'work/calcom-booking-structural.json')), source, config.repo);
    const staticBytes = canonical(staticInput);
    config.staticInputHash = sha256(staticBytes);
    writeFileSync(join(runDir, 'static-input.json'), staticBytes);
    metadata.static_input = { sha256: config.staticInputHash, export_sha256: staticInput.input_export_sha256,
      codegraph_version: staticInput.codegraph_version, nodes: staticInput.nodes.length, edges: staticInput.edges.length,
      files: staticInput.files.length, scope: staticInput.scope, previous_component_assignments_supplied: false };
    const schemaText = readFileSync(join(TEAM_ROOT, 'schema/graph.schema.json'), 'utf8');
    const prompt = readFileSync(join(HERE, 'prompt.md'), 'utf8');
    const instructions = `${prompt}\nTarget: ${target.repo}, commit ${target.commit}.\n\nShared graph schema (format only; no example graph):\n${schemaText}`;
    writeFileSync(join(runDir, 'schema.json'), schemaText);
    writeFileSync(join(runDir, 'instructions.md'), instructions);
    json(join(runDir, 'source-manifest.json'), { commit: target.commit, files: source.files });
    metadata.prompt_sha256 = sha256(instructions);
    metadata.schema_sha256 = sha256(schemaText);
    metadata.source_manifest_sha256 = sha256(readFileSync(join(runDir, 'source-manifest.json')));
    metadata.runner_revision = git(TEAM_ROOT, ['rev-parse', 'HEAD']).trim();
    metadata.runner_files = Object.fromEntries(['package-lock.json', 'prompt.md', 'static.mjs', 'source.mjs', 'graph.mjs', 'source-server.mjs', 'pi.mjs', 'runner.mjs', 'cli.mjs'].map(file => [file, sha256(readFileSync(join(HERE, file)))]));
    metadata.source_file_count = source.files.length;
    metadata.status = options.prepareOnly ? 'prepared' : 'running';
    config.deadline = Date.now() + config.maxMinutes * 60_000;
    json(join(runDir, 'server.json'), config);
    report();
    if (options.prepareOnly) return { runDir, metadata };
    options.progress?.({ stage: 'running', provider: config.provider, model: config.model });
    const execution = await (dependencies.execute ?? executePi)(config, options.progress);
    metadata.execution = execution;
    metadata.usage = execution.usage;
    metadata.estimated_cost_usd = execution.usage?.cost?.total ?? null;
    if (execution.stopReason && execution.stopReason !== 'Graph frozen; stopped after finalization') throw new Error(execution.stopReason);
    if (!existsSync(join(runDir, 'validation.json'))) throw new Error(execution.lastError ?? `Agent did not finalize a valid graph (exit ${execution.code}); see logs`);
    const validation = verifyRun(runDir);
    metadata.graph_sha256 = validation.graph_sha256;
    metadata.counts = { nodes: validation.nodes, edges: validation.edges, groups: validation.groups, source_files: validation.source_files,
      host_edges: validation.host_edges, edge_ops: validation.edge_ops, ...(validation.edge_review ? { edge_review: validation.edge_review } : {}),
      ...(validation.dropped_edges !== undefined ? { dropped_edges: validation.dropped_edges } : {}) };
    metadata.status = 'completed';
    return { runDir, metadata };
  } catch (error) {
    metadata.status = 'failed';
    metadata.error = error.message;
    error.runDir = runDir;
    throw error;
  } finally {
    const transcript = join(runDir, 'tools.jsonl');
    if (existsSync(transcript)) {
      // An interrupted process can leave a partial JSONL record. Preserve failure metadata;
      // verification of a successful run still requires a complete, valid transcript.
      const records = readFileSync(transcript, 'utf8').trim().split('\n').filter(Boolean).flatMap(line => {
        try { return [JSON.parse(line)]; }
        catch { metadata.incomplete_tool_transcript = true; return []; }
      });
      const calls = records
        .filter(event => ['tool_result', 'tool_error'].includes(event.event));
      const reads = calls.filter(event => event.event === 'tool_result' && event.name === 'read_source');
      metadata.inspection = {
        tool_calls: calls.length, failed_tool_calls: calls.filter(event => event.event === 'tool_error').length,
        source_reads: reads.length, unique_files_read: new Set(reads.map(event => event.result.path)).size,
        source_lines_returned: reads.reduce((sum, event) => sum + event.result.end_line - event.result.start_line + 1, 0),
      };
      metadata.tool_transcript_sha256 = sha256(readFileSync(transcript));
    }
    metadata.finished_at = new Date().toISOString();
    metadata.elapsed_seconds = (Date.now() - started) / 1000;
    report();
  }
}
