import { copyFileSync, createReadStream, mkdirSync, readdirSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// The repository's graphs/ folder is the single home for every graph. The viewer
// serves it at /graphs/ in development and copies it into dist/graphs/ on build,
// so nothing is mirrored under public/. Only top-level .yaml/.json files are exposed.
const GRAPHS = fileURLToPath(new URL('../graphs', import.meta.url))
const TYPES: Record<string, string> = { '.yaml': 'application/yaml', '.yml': 'application/yaml', '.json': 'application/json' }
const graphFiles = () => readdirSync(GRAPHS).filter(f => TYPES[extname(f)] && statSync(join(GRAPHS, f)).isFile())

const serveRepoGraphs: Plugin = {
  name: 'repo-graphs:serve',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const url = (req.url ?? '').split('?')[0]
      if (!url.startsWith('/graphs/')) return next()
      const name = decodeURIComponent(url.slice('/graphs/'.length))
      if (!graphFiles().includes(name)) return next()
      res.setHeader('Content-Type', TYPES[extname(name)])
      createReadStream(join(GRAPHS, name)).pipe(res)
    })
  },
}

const copyRepoGraphs: Plugin = {
  name: 'repo-graphs:build',
  apply: 'build',
  closeBundle() {
    const out = fileURLToPath(new URL('dist/graphs', import.meta.url))
    mkdirSync(out, { recursive: true })
    for (const f of graphFiles()) copyFileSync(join(GRAPHS, f), join(out, f))
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), serveRepoGraphs, copyRepoGraphs],
})
