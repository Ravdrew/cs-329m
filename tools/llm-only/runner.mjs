import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkPi, DEFAULT_MODEL, DEFAULT_PROVIDER, executePi } from './pi.mjs';
import { DraftGraph, parseYaml, yaml } from './graph.mjs';
import { assertOutsideRepository, git, prepareCheckout, sha256, Source } from './source.mjs';

export const HERE = dirname(fileURLToPath(import.meta.url));
export const TEAM_ROOT = resolve(HERE, '../..');
const json = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
export function targetConfig() {
  const text = readFileSync(join(TEAM_ROOT, 'targets/calcom.env'), 'utf8');
  const value = key => text.match(new RegExp(`^${key}=(.+)$`, 'm'))?.[1];
  return { remote: value('CALCOM_REPO'), commit: value('CALCOM_SHA'), repo: 'calcom/cal.diy' };
}

export function verifyRun(runDir) {
  const config = JSON.parse(readFileSync(join(runDir, 'server.json'), 'utf8'));
  const source = new Source(config.checkout, config.commit);
  const schema = JSON.parse(readFileSync(join(runDir, 'schema.json'), 'utf8'));
  const events = readFileSync(join(runDir, 'tools.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
  for (const event of events) {
    if (event.event !== 'tool_result' || event.name !== 'read_source') continue;
    const actual = source.read({ path: event.result.path, start_line: event.result.start_line, end_line: event.result.end_line });
    if (actual.excerpt !== event.result.excerpt) throw new Error('Read transcript differs from pinned source');
  }
  const content = readFileSync(join(runDir, 'graph.yaml'), 'utf8');
  const document = parseYaml(content);
  if (document.commit !== config.commit || document.repo !== config.repo || document['x-variant'] !== 'llm-only') throw new Error('Graph header differs from run configuration');
  const draft = new DraftGraph(source, schema, config.repo);
  draft.document = document;
  const verified = draft.validate();
  if (yaml(verified) !== content) throw new Error('Frozen YAML/evidence/hashes differ from validated canonical output');
  const report = JSON.parse(readFileSync(join(runDir, 'validation.json'), 'utf8'));
  if (report.graph_sha256 !== sha256(content)) throw new Error('Frozen graph checksum mismatch');
  if (report.valid !== true || report.commit !== config.commit || report.nodes !== verified.nodes.length ||
      report.edges !== verified.edges.length || report.groups !== verified.groups.length ||
      report.source_files !== verified['x-source-files'].length) throw new Error('Validation report differs from the graph');
  return report;
}

export async function runExperiment(options, dependencies = {}) {
  const started = Date.now();
  const target = dependencies.target ?? targetConfig();
  const outputRoot = resolve(options.outputRoot ?? join(TEAM_ROOT, '..', 'llm-only-runs'));
  mkdirSync(outputRoot, { recursive: true });
  assertOutsideRepository(outputRoot, TEAM_ROOT);
  const runDir = mkdtempSync(join(realpathSync(outputRoot), `${new Date().toISOString().replaceAll(':', '-')}-`));
  const config = {
    ...target, runDir, checkout: join(runDir, 'calcom'), model: options.model ?? DEFAULT_MODEL,
    provider: options.provider ?? DEFAULT_PROVIDER, effort: options.effort ?? 'medium',
    authFile: options.authFile ? resolve(options.authFile) : null,
    maxTools: options.maxTools ?? 600, maxMinutes: options.maxMinutes ?? 45,
  };
  const metadata = {
    version: 1, variant: 'llm-only', backend: 'pi-sdk', status: 'preparing', started_at: new Date(started).toISOString(),
    target, run_directory: runDir, provider: config.provider, model: config.model, reasoning_effort: config.effort,
    limits: { max_tool_calls: config.maxTools, max_minutes: config.maxMinutes },
    isolation: { fresh_session: true, fresh_checkout: true, source_access: 'tracked-regular-files-only custom tools', shell: false, web: false, plugins: false, prior_graphs_supplied: false, inherited_project_instructions: false, os_container: false },
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
    metadata.runner_files = Object.fromEntries(['package-lock.json', 'source.mjs', 'graph.mjs', 'source-server.mjs', 'pi.mjs', 'runner.mjs', 'cli.mjs'].map(file => [file, sha256(readFileSync(join(HERE, file)))]));
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
    metadata.counts = { nodes: validation.nodes, edges: validation.edges, groups: validation.groups, source_files: validation.source_files };
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
