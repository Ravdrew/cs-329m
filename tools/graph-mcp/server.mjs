// Minimal local stdio MCP server for the graph tools: no network, resources, prompts, or writes outside --run-dir.
//
//   node server.mjs --graph G.yaml [--run-dir DIR] [--tools a,b] [--max-chars N] [--max-files N]
//                   [--evidence-per-edge N] [--max-calls N]
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { createGraphTools } from './tools.mjs';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export function parseCli(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      graph: { type: 'string' }, 'run-dir': { type: 'string' }, tools: { type: 'string' },
      'max-chars': { type: 'string' }, 'max-files': { type: 'string' }, 'evidence-per-edge': { type: 'string' },
      'max-calls': { type: 'string' },
    },
  });
  if (!values.graph) throw new Error('Usage: node server.mjs --graph G.yaml [--run-dir DIR] [--tools a,b] ...');
  const int = key => (values[key] === undefined ? undefined : Number.parseInt(values[key], 10));
  const config = {
    graph: values.graph, runDir: values['run-dir'], tools: values.tools?.split(',').map(s => s.trim()).filter(Boolean),
    maxChars: int('max-chars'), maxFiles: int('max-files'), evidencePerEdge: int('evidence-per-edge'), maxCalls: int('max-calls'),
  };
  return Object.fromEntries(Object.entries(config).filter(([, v]) => v !== undefined));
}

export async function serve(config, input = process.stdin, output = process.stdout) {
  const tools = createGraphTools(config);
  const send = message => output.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
  for await (const line of createInterface({ input, crlfDelay: Infinity })) {
    if (!line.trim()) continue;
    let request;
    try {
      if (line.length > 1_000_000) throw new Error('Request too large');
      request = JSON.parse(line);
      if (request.id === undefined) continue; // notifications (e.g. notifications/initialized) need no reply
      let result;
      switch (request.method) {
        case 'initialize': result = { protocolVersion: request.params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'graph', version } }; break;
        case 'ping': result = {}; break;
        case 'tools/list': result = { tools: tools.definitions }; break;
        case 'tools/call': result = tools.call(request.params?.name, request.params?.arguments ?? {}); break;
        case 'resources/list': result = { resources: [] }; break;
        case 'resources/templates/list': result = { resourceTemplates: [] }; break;
        case 'prompts/list': result = { prompts: [] }; break;
        default: send({ id: request.id, error: { code: -32601, message: `Unsupported method: ${request.method}` } }); continue;
      }
      send({ id: request.id, result });
    } catch (error) {
      send({ id: request?.id ?? null, error: { code: request ? -32603 : -32700, message: error.message } });
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  serve(parseCli(process.argv.slice(2))).catch(error => { console.error(error.message); process.exitCode = 1; });
}
