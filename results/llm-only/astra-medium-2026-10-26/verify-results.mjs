#!/usr/bin/env node
// Verify the published artifacts without invoking a model or reading another graph.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { gunzipSync } from 'node:zlib';
import { verifyRun } from '../../../tools/llm-only/runner.mjs';

const { values } = parseArgs({ options: { source: { type: 'string' } } });
assert(values.source, 'Usage: node verify-results.mjs --source /path/to/clean/pinned/calcom');
const bundle = fileURLToPath(new URL('.', import.meta.url));
const source = realpathSync(values.source);
const protocol = JSON.parse(readFileSync(join(bundle, 'protocol.json'), 'utf8'));
const statistics = JSON.parse(readFileSync(join(bundle, 'statistics.json'), 'utf8'));
const hash = content => createHash('sha256').update(content).digest('hex');
let checked = 0;
for (const line of readFileSync(join(bundle, 'checksums.sha256'), 'utf8').trim().split('\n')) {
  const [, expected, relative] = line.match(/^([a-f0-9]{64})  (.+)$/) ?? [];
  assert(expected && relative, 'Invalid checksum record');
  const path = resolve(bundle, relative);
  assert(path.startsWith(bundle.endsWith(sep) ? bundle : bundle + sep), 'Checksum path escapes bundle');
  assert.equal(hash(readFileSync(path)), expected, `Checksum mismatch: ${relative}`);
  checked++;
}

const scratch = mkdtempSync(join(tmpdir(), 'llm-only-result-verify-'));
const results = [];
try {
  for (const row of statistics.runs) {
    const directory = join(bundle, row.name);
    const metadata = JSON.parse(readFileSync(join(directory, 'run.json'), 'utf8'));
    const transcript = gunzipSync(readFileSync(join(directory, 'tools.jsonl.gz')));
    assert.equal(hash(transcript), metadata.tool_transcript_sha256, 'Read transcript checksum mismatch');
    assert.equal(hash(readFileSync(join(directory, 'graph.yaml'))), metadata.graph_sha256);
    assert.equal(metadata.graph_sha256, row.graph_sha256);
    writeFileSync(join(scratch, 'tools.jsonl'), transcript);
    copyFileSync(join(bundle, 'schema.json'), join(scratch, 'schema.json'));
    copyFileSync(join(directory, 'graph.yaml'), join(scratch, 'graph.yaml'));
    copyFileSync(join(directory, 'validation.json'), join(scratch, 'validation.json'));
    writeFileSync(join(scratch, 'server.json'), JSON.stringify({
      checkout: source, commit: protocol.target.commit, repo: protocol.target.repo,
    }));
    results.push({ run: row.name, ...verifyRun(scratch) });
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
console.log(JSON.stringify({ valid: true, checksums_verified: checked, runs: results }, null, 2));
