#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { checkPi } from './pi.mjs';
import { runExperiment, verifyRun } from './runner.mjs';

const HELP = `Automated LLM-only graph construction (Pi SDK, Astra by default).

  node tools/llm-only/cli.mjs [options]
  node tools/llm-only/cli.mjs --check
  node tools/llm-only/cli.mjs --prepare-only [--source /path/to/local/calcom]
  node tools/llm-only/cli.mjs --verify /absolute/path/to/run

Options:
  --provider NAME       Pi provider (default: openai)
  --model NAME          Exact model ID (default: gpt-6-astra; never falls back)
  --effort LEVEL        low, medium (default), high, xhigh or max
  --auth-file PATH      Pi credential file (default: ~/.pi/agent/auth.json if present)
  --source PATH         Local upstream Git object cache; only the pinned commit is fetched
  --output-root PATH    New run directories here; must be outside all Git checkouts
  --max-tools N         Maximum source/graph tool calls (default: 600)
  --max-minutes N       Maximum generation time (default: 45)
  --prepare-only        Prepare clean checkout and inputs without calling a model
  --check               Check Pi, selected model and local authentication; no generation
  --verify PATH         Revalidate a frozen graph, its evidence, transcript and checksum

Uses targets/calcom.env for the commit. Each generation is a new experiment,
with an empty graph. It never resumes a run or reads the historical prediction.
`;
try {
  const { values } = parseArgs({ options: {
    model: { type: 'string' }, provider: { type: 'string' }, effort: { type: 'string' }, 'auth-file': { type: 'string' }, source: { type: 'string' },
    'output-root': { type: 'string' }, 'max-tools': { type: 'string' }, 'max-minutes': { type: 'string' },
    'prepare-only': { type: 'boolean' }, check: { type: 'boolean' }, verify: { type: 'string' }, help: { type: 'boolean', short: 'h' },
  } });
  if (values.help) console.log(HELP);
  else if (values.verify) console.log(JSON.stringify(verifyRun(values.verify), null, 2));
  else if (values.check) console.log(JSON.stringify(await checkPi({ provider: values.provider, model: values.model, effort: values.effort, authFile: values['auth-file'] }), null, 2));
  else {
    const positive = (name, fallback) => {
      const number = Number(values[name] ?? fallback);
      if (!Number.isSafeInteger(number) || number < 1 || number > 100_000) throw new Error(`${name} must be a positive integer <= 100000`);
      return number;
    };
    if (values.effort && !['low', 'medium', 'high', 'xhigh', 'max'].includes(values.effort)) throw new Error('Invalid reasoning effort');
    const result = await runExperiment({
      model: values.model, provider: values.provider, effort: values.effort, authFile: values['auth-file'], source: values.source,
      outputRoot: values['output-root'], prepareOnly: values['prepare-only'],
      maxTools: positive('max-tools', 600), maxMinutes: positive('max-minutes', 45),
      progress: value => console.error(JSON.stringify(value)),
    });
    console.log(JSON.stringify({ status: result.metadata.status, run_directory: result.runDir, counts: result.metadata.counts }, null, 2));
  }
} catch (error) {
  console.error(JSON.stringify({ error: error.message, run_directory: error.runDir }));
  process.exitCode = 1;
}
