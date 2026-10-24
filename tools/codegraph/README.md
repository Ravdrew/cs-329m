# CodeGraph baseline

This branch uses [colbymchenry/codegraph](https://github.com/colbymchenry/codegraph),
pinned to version **1.6.2** in `package.json` and `package-lock.json`.
The CLI is installed locally; `node_modules/` is ignored by Git.

From the repository root:

```bash
npm ci --prefix tools/codegraph
bash scripts/codegraph.sh --version
bash scripts/codegraph.sh --help
```

To build a graph after setting up the target checkout:

```bash
# Requires Node 20; installs Cal.com's dependencies as well as cloning it.
bash scripts/setup_calcom.sh
bash scripts/codegraph.sh init work/calcom
bash scripts/codegraph.sh status work/calcom
```

The inherited setup pins `calcom/cal.com` to `54343aa685ae8f33159d2f485ec4a57bad5c574a`.
The viewer/scorer branch's sample graph instead targets `calcom/cal.diy` at
`6bfe2df9d13c456dc9374c9e6581b36fba188728`; align the target repository and commit
before comparing baseline graphs.

Installing the CLI does not clone or index Cal.com, configure agent MCP servers,
or convert CodeGraph output to the shared conceptual graph schema.
