#!/usr/bin/env python3
"""Record plain-text source exploration; never infer graph structure."""
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
LOG = Path(__file__).with_name('exploration.jsonl')
COMMIT = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()


def inspect(action):
    kind = action['kind']
    if kind == 'read':
        relative = action['path']
        path = (ROOT / relative).resolve()
        path.relative_to(ROOT)
        lines = path.read_text().splitlines()
        start, end = action.get('start', 1), action.get('end', len(lines))
        output = '\n'.join(f'{n}: {lines[n-1]}' for n in range(start, min(end, len(lines)) + 1))
        code = 0
    elif kind in ('find', 'search'):
        paths = action.get('paths', ['apps/web', 'packages/features', 'packages/trpc', 'packages/prisma', 'packages/lib'])
        for relative in paths:
            (ROOT / relative).resolve().relative_to(ROOT)
        command = ['rg', '--files'] if kind == 'find' else ['rg', '-n', '--glob', '!*.test.*', '--glob', '!*.spec.*', '--', action['pattern']]
        result = subprocess.run(command + paths, cwd=ROOT, text=True, capture_output=True)
        output, code = result.stdout, result.returncode
        if kind == 'find' and action.get('pattern'):
            import re
            output = '\n'.join(line for line in output.splitlines() if re.search(action['pattern'], line))
        if result.stderr:
            output += result.stderr
    else:
        raise ValueError(f'Unknown action: {kind}')
    limit = action.get('limit', 200)
    visible = '\n'.join(output.splitlines()[:limit])
    entry = {'time_utc': datetime.now(timezone.utc).isoformat(), 'source_commit': COMMIT, 'action': action, 'exit_code': code,
             'output_sha256': hashlib.sha256(output.encode()).hexdigest(),
             'total_lines': len(output.splitlines()), 'shown_lines': len(visible.splitlines()), 'output': visible}
    with LOG.open('a') as handle:
        handle.write(json.dumps(entry) + '\n')
    print(json.dumps(action))
    print(visible)
    if len(output.splitlines()) > limit:
        print(f'[truncated: {len(output.splitlines())} total lines]')


if __name__ == '__main__':
    for item in json.load(sys.stdin):
        try:
            inspect(item)
        except (OSError, ValueError) as exc:
            entry = {'time_utc': datetime.now(timezone.utc).isoformat(), 'source_commit': COMMIT,
                     'action': item, 'exit_code': 1, 'error': str(exc)}
            with LOG.open('a') as handle:
                handle.write(json.dumps(entry) + '\n')
            print(json.dumps(entry), file=sys.stderr)
