#!/usr/bin/env python3
"""Sanity check for the regression metric: the real PR (gold patch) should break no baseline test.

  gold_regress.py PULL     after `harness.py prepare PULL` and `harness.py baseline PULL`
Applies the full PR diff (tests and support files included), runs the full unit suite, and reports baseline tests that
now fail (excluding the task's FAIL_TO_PASS). Leaves the workspace clean afterwards.
"""
import json, sys
import harness as h

pull = int(sys.argv[1])
t = h.task(pull)
h.add_tests(t)
excl = ' '.join(f"':(exclude){f}'" for f in t['test_files'] + t['support_files'])
h.sh(h.realgit(f'diff --binary {t["base"]} {t["merge"]} -- . {excl}') +
     f' > /tmp/gold.diff && cd {h.CALCOM} && git apply --whitespace=nowarn /tmp/gold.diff')
schema = 'packages/prisma/schema.prisma' in open('/tmp/gold.diff').read()
if schema:
    h.regen_prisma()
base = set(json.load(open(h.RESULTS / f'{pull}-baseline.json'))['stable_passing'])
now = h.full_suite(f'{pull}-gold')
broke = sorted(base - now - set(t['f2p']))
out = {'pull': pull, 'baseline_stable_passing': len(base), 'gold_passing': len(now), 'broken_by_gold': broke}
json.dump(out, open(h.RESULTS / f'{pull}-gold-regress.json', 'w'), indent=1)
print(json.dumps(out | {'broken_by_gold': len(broke)}, indent=1), broke[:20])
h.sh(h.ENV + 'git checkout -q -- . && git clean -q -fd -e node_modules -e "**/node_modules"')
if schema:
    h.regen_prisma()
