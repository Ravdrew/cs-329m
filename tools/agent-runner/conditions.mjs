// The Q2/Q3 conditions. Each says which make_prompt.py block the prompt gets (only that block differs), which graph
// the agent can query and on which channel, and which per-task inputs it needs.
//   base   — the graph of the code as it is at the task's base commit
//   edit   — the same graph with the developer's edit (status/note) applied
//   intent — the developer's intent written as prose, for the same change
export const CONDITIONS = {
  prose: { prompt: [], channel: 'none', needs: [] },
  'prose-intent': { prompt: ['--intent', '{intent}'], channel: 'none', needs: ['intent'] },
  text: { prompt: ['--graph', '{edit}'], channel: 'none', needs: ['edit'] },
  tool: { prompt: ['--graph-tools', 'graph'], channel: 'mcp', graph: 'edit', needs: ['edit'] },
  'tool-guided': { prompt: ['--graph-tools', 'graph-guided'], channel: 'mcp', graph: 'edit', needs: ['edit'] },
  'tool-noedit': { prompt: ['--graph-tools', 'graph'], channel: 'mcp', graph: 'base', needs: ['base'] },
  codegraph: { prompt: ['--graph-tools', 'codegraph'], channel: 'none', codegraph: true, needs: [] },
  // The intent plus CodeGraph: prose-intent with a code index, against which tool/text are compared.
  'codegraph-intent': { prompt: ['--intent', '{intent}', '--graph-tools', 'codegraph'], channel: 'none', codegraph: true, needs: ['intent'] },
};

/** make_prompt.py arguments and the graph the agent can query, for one condition and a task's inputs. */
// A condition can name one of several graph sets for a task: "text@chain" is the text condition with the graph files
// of inputs.sets.chain (edit, base) in place of the task's own; other inputs (intent) are shared by every set.
export const conditionOf = name => CONDITIONS[String(name).split('@')[0]];

/** The task inputs a condition sees: with "@SET", that set's graph files over the shared inputs. */
export function effectiveInputs(name, inputs = {}) {
  const set = String(name).split('@')[1];
  const { sets, ...shared } = inputs;
  if (set === undefined) return shared;
  if (!sets?.[set]) throw new Error(`Condition ${name} needs task inputs.sets.${set}`);
  return { ...shared, ...sets[set] };
}

export function resolveCondition(name, inputs = {}) {
  const c = conditionOf(name);
  if (!c) throw new Error(`Unknown condition "${name}". Conditions: ${Object.keys(CONDITIONS).join(', ')}, each optionally @SET`);
  inputs = effectiveInputs(name, inputs);
  const missing = c.needs.filter(k => !inputs[k]);
  if (missing.length) throw new Error(`Condition ${name} needs task inputs: ${missing.join(', ')}`);
  return {
    name, channel: c.channel, codegraph: Boolean(c.codegraph),
    graph: c.graph ? inputs[c.graph] : undefined,
    promptArgs: c.prompt.map(a => a.replace(/^\{(\w+)\}$/, (_, k) => inputs[k])),
  };
}
