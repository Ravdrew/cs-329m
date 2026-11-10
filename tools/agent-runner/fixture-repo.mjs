// A miniature benchmark task that stands in for Cal.com, for the real-harness test and the real-model smoke test:
// an upstream repository with a base and a merge commit (the feature plus a hidden test), the task list, spec and
// intent for it, base and edited component graphs, and pilot directories that harness.py can prepare. A fake `yarn`
// runs the hidden test with Node and writes Vitest's JSON report, which is what harness.run_tests reads.
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const TASK = 1;
export const BOOKING = 'export function book(id) {\n  return `booked ${id}`;\n}\n';
export const FEATURE = `${BOOKING}\nexport function cancelBooking(id) {\n  return \`cancelled \${id}\`;\n}\n`;
const HIDDEN_TEST = `let status = 'failed';
try {
  const m = await import('./booking.mjs');
  if (m.cancelBooking?.('b1') === 'cancelled b1') status = 'passed';
} catch {}
console.log(JSON.stringify({ title: 'cancels a booking', status }));
`;
const FAKE_YARN = `#!/usr/bin/env node
const { execFileSync } = require('node:child_process');
const { writeFileSync } = require('node:fs');
const { resolve } = require('node:path');
const args = process.argv.slice(2);
if (args[0] !== 'vitest') process.exit(0);
const out = args.find(a => a.startsWith('--outputFile=')).split('=')[1];
const testResults = args.filter(a => a.endsWith('.test.mjs')).map(f => {
  let text = '';
  try { text = execFileSync(process.execPath, [resolve(f)], { encoding: 'utf8' }); } catch (e) { text = e.stdout || ''; }
  const assertionResults = text.split('\\n').filter(Boolean).map(l => JSON.parse(l)).map(r => ({ ancestorTitles: [], title: r.title, status: r.status }));
  return { name: resolve(f), status: assertionResults.every(a => a.status === 'passed') ? 'passed' : 'failed', assertionResults, message: '' };
});
writeFileSync(out, JSON.stringify({ testResults }));
`;

/** Component graphs of the fixture: as it is, and with the developer's edit (a new cancel action on the service). */
function graphs(base) {
  const graph = edited => ({
    version: 1, repo: 'fixture/bookings', commit: base, title: 'Bookings fixture',
    groups: [],
    nodes: [
      { id: 'booking-service', label: 'Booking service', kind: 'service', summary: 'Creates bookings.',
        files: [{ path: 'src/booking.mjs', role: 'entry' }], provenance: 'manual',
        ...(edited ? { status: 'modify', note: 'Attendees must be able to cancel a booking by its id.' } : {}) },
      ...(edited ? [{ id: 'cancel-action', label: 'Cancel booking', kind: 'service', summary: 'New: cancels a booking by id.',
        files: [], provenance: 'manual', status: 'new', note: 'Export it from the booking service module.' }] : []),
    ],
    edges: edited ? [{ from: 'cancel-action', to: 'booking-service', kind: 'uses', status: 'new' }] : [],
  });
  return { base: graph(false), edit: graph(true) };
}

/**
 * Build the fixture under `root` (a real path) with `workers` pilot directories. Sets BENCH_TASKS, SPECS_DIR and
 * TASK_OVERRIDES in this process's environment, which make_prompt.py and harness.py inherit.
 */
export function makeFixture(root, workers = 1) {
  const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=f@example.invalid', ...args], { cwd, encoding: 'utf8' }).trim();
  const upstream = join(root, 'upstream');
  mkdirSync(join(upstream, 'src'), { recursive: true });
  git(upstream, 'init', '-q', '-b', 'main');
  writeFileSync(join(upstream, '.gitignore'), 'node_modules\n.env\ndist\n');
  writeFileSync(join(upstream, 'src/booking.mjs'), BOOKING);
  git(upstream, 'add', '.');
  git(upstream, 'commit', '-q', '-m', 'base');
  const base = git(upstream, 'rev-parse', 'HEAD');
  writeFileSync(join(upstream, 'src/booking.mjs'), FEATURE);
  writeFileSync(join(upstream, 'src/booking.test.mjs'), HIDDEN_TEST);
  git(upstream, 'add', '.');
  git(upstream, 'commit', '-q', '-m', 'Add cancelBooking');
  const merge = git(upstream, 'rev-parse', 'HEAD');

  const inputs = join(root, 'inputs');
  mkdirSync(inputs, { recursive: true });
  writeFileSync(join(inputs, 'tasks.json'), JSON.stringify([{
    pull_number: TASK, base_commit: base, merge_commit: merge, test_files: ['src/booking.test.mjs'],
    FAIL_TO_PASS: ['src/booking.test.mjs::cancels a booking'], PASS_TO_PASS: [], source_files: ['M:src/booking.mjs'],
    test_cmd: 'TZ=UTC yarn vitest run src/booking.test.mjs', problem_statement: 'Attendees should be able to cancel a booking.',
  }]));
  writeFileSync(join(inputs, `${TASK}.md`), '## Interface the tests expect\n\n`src/booking.mjs` exports `cancelBooking(id)`.\n');
  writeFileSync(join(inputs, 'intent.md'), 'Add cancelBooking next to book in src/booking.mjs.\n');
  writeFileSync(join(inputs, 'overrides.json'), '{}');
  const g = graphs(base);
  writeFileSync(join(inputs, 'base.json'), JSON.stringify(g.base, null, 2));
  writeFileSync(join(inputs, 'edit.json'), JSON.stringify(g.edit, null, 2));

  const pilots = Array.from({ length: workers }, (_, i) => {
    const pilotDir = join(root, `pilot-${i}`);
    mkdirSync(join(pilotDir, 'bin'), { recursive: true });
    writeFileSync(join(pilotDir, 'bin/yarn'), FAKE_YARN);
    chmodSync(join(pilotDir, 'bin/yarn'), 0o755);
    writeFileSync(join(pilotDir, 'env.sh'), `export PATH="${pilotDir}/bin:$PATH"\n`);
    execFileSync('git', ['clone', '-q', upstream, join(pilotDir, 'calcom')]);
    mkdirSync(join(pilotDir, 'calcom/node_modules/.bin'), { recursive: true });
    writeFileSync(join(pilotDir, 'calcom/node_modules/.bin/turbo'), '#!/bin/sh\nexit 0\n');
    chmodSync(join(pilotDir, 'calcom/node_modules/.bin/turbo'), 0o755);
    return { pilotDir, pilotPrivate: join(root, `private-${i}`) };
  });
  Object.assign(process.env, { BENCH_TASKS: join(inputs, 'tasks.json'), SPECS_DIR: inputs, TASK_OVERRIDES: join(inputs, 'overrides.json') });
  return {
    pilots, base, merge,
    inputs: { base: join(inputs, 'base.json'), edit: join(inputs, 'edit.json'), intent: join(inputs, 'intent.md') },
  };
}
