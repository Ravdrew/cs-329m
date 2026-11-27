// Everything a run does before the agent starts, for every task and condition of a matrix, with no model calls:
// resolve the condition and its inputs, build the exact prompt with make_prompt.py, and for graph-tool conditions start
// the graph tools on the graph the agent would get and read the requested change.
//
//   node experiments/main/dry-run.mjs --matrix matrix.json        (exit 1 if anything is wrong)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const ROOT = resolve(new URL('../..', import.meta.url).pathname);
const { conditionOf, effectiveInputs, resolveCondition } = await import(join(ROOT, 'tools/agent-runner/conditions.mjs'));
const { createGraphTools } = await import(join(ROOT, 'tools/graph-mcp/tools.mjs'));
const { changeOf } = await import(join(ROOT, 'tools/graph-mcp/graph.mjs'));

const { values } = parseArgs({ options: { matrix: { type: 'string' } } });
const matrix = JSON.parse(readFileSync(values.matrix, 'utf8'));
const tmp = mkdtempSync(join(tmpdir(), 'dry-run-'));
const problems = [], rows = [];
const prompts = new Map();
const cli = join(ROOT, 'tools/codegraph/node_modules/.bin/codegraph');
if (matrix.conditions.some(c => conditionOf(c)?.codegraph) && !existsSync(cli)) problems.push(`CodeGraph CLI missing: ${cli} (npm ci --prefix tools/codegraph)`);

for (const task of matrix.tasks) {
  for (const name of matrix.conditions) {
    const row = { task, condition: name };
    try {
      const c = resolveCondition(name, matrix.inputs?.[task]);
      const inputs = effectiveInputs(name, matrix.inputs?.[task]);
      for (const [k, p] of Object.entries(inputs)) if (typeof p === 'string' && !existsSync(p)) throw new Error(`input ${k} missing: ${p}`);
      const out = join(tmp, `${task}-${name}.md`);
      execFileSync(matrix.python ?? 'python3', [join(ROOT, 'q2q3-tools/make_prompt.py'), String(task), '--spec', ...c.promptArgs, '-o', out],
        { cwd: join(ROOT, 'q2q3-tools'), stdio: ['ignore', 'ignore', 'pipe'] });
      const prompt = readFileSync(out, 'utf8');
      prompts.set(`${task}|${name}`, prompt);
      row.prompt_tokens = Math.round(prompt.length / 4);
      if (c.channel === 'mcp') {
        const tools = createGraphTools({ graph: c.graph });
        const g = tools.index.graph, marked = [...g.nodes, ...g.edges].filter(changeOf).length;
        const req = tools.call('get_requested_change').content[0].text;
        row.graph_nodes = g.nodes.length; row.marked = marked;
        const wantsEdit = conditionOf(name).graph === 'edit';
        if (wantsEdit && !marked) throw new Error('edit graph has nothing marked');
        if (!wantsEdit && marked) throw new Error('base graph has marks');
        if (wantsEdit && !req.includes('Developer note')) throw new Error('get_requested_change shows no notes');
      }
      if (name.startsWith('text')) row.marked = (prompt.match(/Developer note/g) ?? []).length;
      if (conditionOf(name).needs.includes('intent') && !prompt.includes(readFileSync(inputs.intent, 'utf8').trim().slice(0, 200))) throw new Error('intent not in prompt');
      row.ok = true;
    } catch (error) { row.ok = false; row.error = error.message.split('\n')[0]; problems.push(`#${task} ${name}: ${row.error}`); }
    rows.push(row);
  }
  // Every prompt of a task starts with the same description and spec, and ends with the same work instructions.
  const ps = matrix.conditions.map(n => prompts.get(`${task}|${n}`)).filter(Boolean);
  const head = p => p.slice(0, p.indexOf('## Interface the tests expect') + 1), tail = p => p.slice(p.indexOf('\n\nImplement this change'));
  if (ps.some(p => head(p) !== head(ps[0]) || tail(p) !== tail(ps[0]))) problems.push(`#${task}: prompts differ outside the condition block`);
}
rmSync(tmp, { recursive: true, force: true });

const by = (k) => [...new Set(rows.map(r => r[k]))];
console.log(`${rows.length} runs per repeat (${matrix.tasks.length} tasks x ${matrix.conditions.length} conditions), ${rows.filter(r => r.ok).length} ready`);
console.log('\nPrompt size (approx. tokens; median over tasks) and marked entries:');
for (const c of by('condition')) {
  const rs = rows.filter(r => r.condition === c && r.ok), t = rs.map(r => r.prompt_tokens).sort((a, b) => a - b);
  const m = rs.filter(r => r.marked !== undefined).map(r => r.marked);
  console.log(`  ${c.padEnd(18)} ${String(t[Math.floor(t.length / 2)] ?? '-').padStart(6)} tokens` + (m.length ? `   marked ${Math.min(...m)}-${Math.max(...m)}` : ''));
}
if (problems.length) { console.log(`\n${problems.length} problems:`); for (const p of problems) console.log(`  ${p}`); process.exitCode = 1; }
else console.log('\nNo problems.');
