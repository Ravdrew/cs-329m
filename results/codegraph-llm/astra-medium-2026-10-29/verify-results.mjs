#!/usr/bin/env node
// Replay published evidence and static aggregation without calling a model.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { gunzipSync } from 'node:zlib';
import { verifyRun } from '../../../tools/codegraph-llm/runner.mjs';

const { values } = parseArgs({ options: { source: { type: 'string' } } });
assert(values.source, 'Usage: node verify-results.mjs --source /path/to/clean/pinned/calcom');
const bundle = fileURLToPath(new URL('.', import.meta.url));
const source = realpathSync(values.source);
const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
const protocol = readJson(join(bundle, 'protocol.json'));
const statistics = readJson(join(bundle, 'statistics.json'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const runner = fileURLToPath(new URL('../../../tools/codegraph-llm/', import.meta.url));
for (const [file, expected] of Object.entries(protocol.runner_files)) {
  assert.equal(hash(readFileSync(join(runner, file))), expected, `Runner changed: ${file}`);
}
assert.equal(statistics.runs.length, protocol.runs.completed);
assert.equal(new Set(statistics.runs.map(row => row.session_id)).size, statistics.runs.length);
let checked = 0;
const listed = new Set();
for (const line of readFileSync(join(bundle, 'checksums.sha256'), 'utf8').trim().split('\n')) {
  const [, expected, relative] = line.match(/^([a-f0-9]{64})  (.+)$/) ?? [];
  assert(expected && relative && !listed.has(relative), 'Invalid or duplicate checksum record');
  listed.add(relative);
  const path = resolve(bundle, relative);
  assert(path.startsWith(bundle.endsWith(sep) ? bundle : bundle + sep), 'Checksum path escapes bundle');
  assert.equal(hash(readFileSync(path)), expected, `Checksum mismatch: ${relative}`);
  checked++;
}
const staticInput = gunzipSync(readFileSync(join(bundle, 'static-input.json.gz')));
assert.equal(hash(staticInput), protocol.static_input.sha256, 'Static input checksum mismatch');
assert.equal(hash(readFileSync(join(bundle, 'schema.json'))), protocol.schema_sha256);
assert.equal(hash(readFileSync(join(bundle, 'instructions.md'))), protocol.prompt_sha256);
assert.equal(hash(gunzipSync(readFileSync(join(bundle, 'source-manifest.json.gz')))), protocol.source_manifest_sha256);
const scratch = mkdtempSync(join(tmpdir(), 'codegraph-hotstart-result-verify-'));
const results = [];
try {
  for (const row of statistics.runs) {
    const directory = join(bundle, row.name);
    const metadata = readJson(join(directory, 'run.json'));
    assert.equal(metadata.status, 'completed');
    assert.equal(metadata.runner_revision, protocol.runner_revision);
    assert.deepEqual(metadata.runner_files, protocol.runner_files);
    assert.deepEqual(metadata.target, protocol.target);
    assert.equal(metadata.static_input.sha256, protocol.static_input.sha256);
    assert.equal(metadata.prompt_sha256, protocol.prompt_sha256);
    assert.equal(metadata.schema_sha256, protocol.schema_sha256);
    assert.equal(metadata.source_manifest_sha256, protocol.source_manifest_sha256);
    const transcript = gunzipSync(readFileSync(join(directory, 'tools.jsonl.gz')));
    assert.equal(hash(transcript), metadata.tool_transcript_sha256);
    assert.equal(hash(readFileSync(join(directory, 'graph.yaml'))), metadata.graph_sha256);
    assert.equal(metadata.graph_sha256, row.graph_sha256);
    writeFileSync(join(scratch, 'tools.jsonl'), transcript);
    writeFileSync(join(scratch, 'static-input.json'), staticInput);
    copyFileSync(join(bundle, 'schema.json'), join(scratch, 'schema.json'));
    for (const file of ['graph.yaml', 'components.yaml', 'validation.json']) {
      copyFileSync(join(directory, file), join(scratch, file));
    }
    for (const file of ['graph.json', 'membership.json', 'aggregation.json']) {
      writeFileSync(join(scratch, file), gunzipSync(readFileSync(join(directory, file + '.gz'))));
    }
    writeFileSync(join(scratch, 'server.json'), JSON.stringify({
      checkout: source, commit: protocol.target.commit, repo: protocol.target.repo,
      staticInputHash: protocol.static_input.sha256,
    }));
    const verified = verifyRun(scratch);
    assert.deepEqual(verified, readJson(join(directory, 'independent-verification.json')));
    results.push({ run: row.name, ...verified });
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
console.log(JSON.stringify({ valid: true, checksums_verified: checked, runs: results }, null, 2));
