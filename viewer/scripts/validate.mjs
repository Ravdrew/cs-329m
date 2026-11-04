// Usage: node scripts-validate.mjs <graph.yaml|json> [...]
import { readFileSync } from "node:fs";
import Ajv from "ajv/dist/2020.js";
import { load } from "js-yaml";
const schema = JSON.parse(readFileSync(new URL("../../schema/graph.schema.json", import.meta.url)));
const validate = new Ajv({ allErrors: true }).compile(schema);
let ok = true;
for (const f of process.argv.slice(2)) {
  const g = load(readFileSync(f, "utf8"));
  const valid = validate(g);
  const ids = new Set(g.nodes.map((n) => n.id));
  const gids = new Set((g.groups ?? []).map((x) => x.id));
  const refErrors = [
    ...g.edges.filter((e) => !ids.has(e.from) || !ids.has(e.to)).map((e) => `edge ${e.from}->${e.to}: unknown node`),
    ...g.nodes.filter((n) => n.group && !gids.has(n.group)).map((n) => `node ${n.id}: unknown group ${n.group}`),
    ...(g.groups ?? []).filter((x) => x.parent && !gids.has(x.parent)).map((x) => `group ${x.id}: unknown parent`),
  ];
  if (valid && refErrors.length === 0) {
    console.log(`OK   ${f}  (${g.nodes.length} nodes, ${g.edges.length} edges, ${(g.groups ?? []).length} groups)`);
  } else {
    ok = false;
    console.log(`FAIL ${f}`);
    for (const e of validate.errors ?? []) console.log(`  ${e.instancePath} ${e.message} ${JSON.stringify(e.params)}`);
    for (const e of refErrors) console.log(`  ${e}`);
  }
}
process.exit(ok ? 0 : 1);
