#!/usr/bin/env python3
"""Sanity check for the regression metric: the real PR (gold patch) should break no baseline test.

  gold_regress.py PULL     after `harness.py prepare PULL` and `harness.py baseline PULL`
Applies the full PR diff (tests and support files included), runs the full unit suite, and reports baseline tests that
now fail (excluding the task's FAIL_TO_PASS). Leaves the workspace clean afterwards.
"""
import json, sys
import harness as h

def main(pull):
    h.TMP.mkdir(parents=True, exist_ok=True)
    output = h.RESULTS / f'{pull}-gold-regress.json'
    output.unlink(missing_ok=True)
    t = h.task(pull)
    schema = False
    try:
        h.add_tests(t)
        excl = ' '.join(f"':(exclude){f}'" for f in t['test_files'] + t['support_files'])
        h.sh(h.realgit(f'diff --binary {t["base"]} {t["merge"]} -- . {excl}') + f' > {h.TMP}/gold.diff')
        schema = 'packages/prisma/schema.prisma' in open(h.TMP / 'gold.diff').read()
        h.sh(f'cd {h.CALCOM} && git apply --whitespace=nowarn {h.TMP}/gold.diff')
        if schema:
            h.regen_prisma()
        base = set(json.load(open(h.RESULTS / f'{pull}-baseline.json'))['stable_passing'])
        now, error = h.full_suite(f'{pull}-gold')
        broke = None if now is None else sorted(base - now - set(t['f2p']))
        out = {'pull': pull, 'baseline_stable_passing': len(base),
               'gold_passing': None if now is None else len(now), 'broken_by_gold': broke,
               'execution_error': error}
        json.dump(out, open(output, 'w'), indent=1)
        print(json.dumps(out | {'broken_by_gold': None if broke is None else len(broke)}, indent=1),
              [] if broke is None else broke[:20])
        return 1 if error else 0
    finally:
        try:
            h.sh(h.ENV + 'git checkout -q -- . && git clean -q -fd -e node_modules -e "**/node_modules"')
        finally:
            if schema:
                h.regen_prisma()


if __name__ == '__main__':
    sys.exit(main(int(sys.argv[1])))
