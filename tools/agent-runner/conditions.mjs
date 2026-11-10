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
  'tool-noedit': { prompt: ['--graph-tools', 'graph'], channel: 'mcp', graph: 'base', needs: ['base'] },
  codegraph: { prompt: ['--graph-tools', 'codegraph'], channel: 'none', codegraph: true, needs: [] },
};

/** make_prompt.py arguments and the graph the agent can query, for one condition and a task's inputs. */
export function resolveCondition(name, inputs = {}) {
  const c = CONDITIONS[name];
  if (!c) throw new Error(`Unknown condition "${name}". Conditions: ${Object.keys(CONDITIONS).join(', ')}`);
  const missing = c.needs.filter(k => !inputs[k]);
  if (missing.length) throw new Error(`Condition ${name} needs task inputs: ${missing.join(', ')}`);
  return {
    name, channel: c.channel, codegraph: Boolean(c.codegraph),
    graph: c.graph ? inputs[c.graph] : undefined,
    promptArgs: c.prompt.map(a => a.replace(/^\{(\w+)\}$/, (_, k) => inputs[k])),
  };
}
