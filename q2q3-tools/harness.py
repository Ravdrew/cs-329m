#!/usr/bin/env python3
"""Harness for one benchmark task (v2, 2026-11-02).

  harness.py prepare  PULL   check out the base commit, install, hide git history (agent workspace ready)
  harness.py check    PULL   sanity check: PR tests fail at base, pass with the real PR's source changes
  harness.py evaluate PULL   after the agent: record its diff, add the PR's tests, run them, score files
  harness.py restore  PULL   put git history back
  harness.py reset    PULL   between agent runs: back to the prepared base snapshot, without reinstalling
  harness.py baseline PULL   at base: run the full unit suite twice, save the tests that pass both times
  harness.py evaluate PULL LABEL --regress   also run the full suite after the agent and list baseline tests that broke

v2 changes: tasks come from the benchmark's tasks.json (BENCH_TASKS) with per-task overrides (task_overrides.json);
hidden_support_files are copied in with the hidden tests, excluded from the gold diff, and not counted as PR files
for file recall/precision; optional full-suite regression check against a per-task baseline.

The agent works in CALCOM with .git moved aside and a throwaway git repo created at the base snapshot,
so it cannot read the real PR from history. The PR's test files are added only at evaluation.
"""
import json, os, re, shutil, subprocess, sys, time
from pathlib import Path

# resolve(): Vitest reports real paths, and on macOS /tmp and /var are symlinks to /private/..., so test ids are only
# relative to CALCOM if CALCOM is a real path too.
PILOT = Path(os.environ.get('PILOT_DIR', '/home/claude/pilot')).resolve()   # holds calcom/ and env.sh
CALCOM = PILOT / 'calcom'
PRIVATE = Path(os.environ.get('PILOT_PRIVATE', '/root/pilot-private')).resolve()
HIDDEN = PRIVATE / 'calcom.git-hidden'
RESULTS = PRIVATE / 'results'
TMP = PRIVATE / 'tmp'   # per PILOT_PRIVATE, so parallel workers never share test reports or patches
TOOLS = Path(__file__).resolve().parent
BENCH_TASKS = Path(os.environ.get('BENCH_TASKS', TOOLS.parent / 'benchmark' / 'tasks.json'))
OVERRIDES = Path(os.environ.get('TASK_OVERRIDES', TOOLS / 'task_overrides.json'))
ENV = f"source {PILOT}/env.sh && cd {CALCOM} && "


def sh(cmd, check=True, timeout=None):
    r = subprocess.run(['bash', '-lc', cmd], capture_output=True, text=True, timeout=timeout)
    if check and r.returncode:
        raise SystemExit(f'FAILED: {cmd}\n{r.stdout[-3000:]}\n{r.stderr[-3000:]}')
    return r


def task(pull):
    """Benchmark task in the harness's field names, with overrides applied."""
    b = next(t for t in json.load(open(BENCH_TASKS)) if t['pull_number'] == pull)
    over = json.load(open(OVERRIDES)).get(str(pull), {}) if OVERRIDES.exists() else {}
    support = over.get('hidden_support_files', [])
    return {'pull': pull, 'base': b['base_commit'], 'merge': b['merge_commit'], 'test_files': b['test_files'],
            'support_files': support, 'f2p': b['FAIL_TO_PASS'], 'p2p': b.get('PASS_TO_PASS', []),
            'test_cmd': b['test_cmd'],
            'source_files': [e for e in b['source_files'] if e.partition(':')[2].split('\t')[-1] not in support]}


def realgit(args):
    """git against the real history, wherever it currently lives."""
    gd = HIDDEN if HIDDEN.exists() else CALCOM / '.git'
    return f'git --git-dir={gd} --work-tree={CALCOM} {args}'


def paths(entries):
    out = []
    for e in entries:
        st, _, rest = e.partition(':')
        if st.startswith('R'):
            out.append(rest.split('\t')[-1])
        else:
            out.append(rest)
    return out


def prepare(pull):
    t = task(pull)
    restore(pull, quiet=True)
    sh(ENV + f'git fetch -q origin {t["base"]} {t["merge"]} || true; git checkout -q -f --detach {t["base"]} && git clean -q -fdx -e node_modules -e "**/node_modules" -e packages/prisma/generated -e packages/prisma/zod -e packages/kysely -e packages/prisma/enums')
    t0 = time.time()
    sh(ENV + 'yarn install > ../install-' + str(pull) + '.log 2>&1 || true; node_modules/.bin/turbo run post-install --env-mode=loose > ../postinstall-' + str(pull) + '.log 2>&1', timeout=3600)
    print(f'install+generate {time.time()-t0:.0f}s')
    # Never let git maintenance run while .git is being moved: a background `gc --auto` left running by an earlier
    # git command can write into the old path after the move (this destroyed a clone on 2026-11-02).
    if HIDDEN.exists():
        raise SystemExit(f'{HIDDEN} already exists: run restore first')
    sh(f'git -C {CALCOM} config gc.auto 0 && git -C {CALCOM} config maintenance.auto false; '
       # comm is a bare name on Linux and a full path on macOS (/usr/bin/git): compare the basename.
       'while ps -eo comm=,args= | awk \'{c=$1; sub(/.*\\//, "", c)} c=="git" && ($3=="gc" || $3=="maintenance" || $3=="repack")\' | grep -q .; do sleep 2; done')
    shutil.move(str(CALCOM / '.git'), str(HIDDEN))
    sh(ENV + 'git init -q && git config gc.auto 0 && git add -A . >/dev/null 2>&1 && git -c user.email=pilot@x -c user.name=pilot commit -q -m base --no-verify')
    # Ignored files present now (installs, generated clients) are part of the base; reset removes any others.
    (PRIVATE / f'{pull}-ignored-at-base.txt').write_text(ignored_files())
    print('workspace ready, history hidden')


def ignored_files():
    return sh(ENV + 'git ls-files --others --ignored --exclude-standard --directory').stdout


def reset(pull):
    """Between agent runs on a prepared task: back to the base snapshot without reinstalling. Removes the agent's
    changes, the hidden tests evaluate added, and ignored files created since prepare (e.g. a .env or build output),
    and regenerates the Prisma client if the schema had changed."""
    if not HIDDEN.exists():
        raise SystemExit(f'{HIDDEN} does not exist: run prepare {pull} first')
    base = PRIVATE / f'{pull}-ignored-at-base.txt'
    if not base.exists():
        raise SystemExit(f'{base} does not exist: run prepare {pull} again')
    schema = sh(ENV + 'git status --porcelain -- packages/prisma/schema.prisma').stdout.strip() != ''
    # reset --hard, not checkout: evaluate stages the agent's changes, and checkout would restore the staged copies.
    sh(ENV + 'git reset -q --hard && git clean -q -fd -e node_modules -e "**/node_modules"')
    keep = set(base.read_text().splitlines())
    extra = [p for p in ignored_files().splitlines() if p not in keep]
    for p in extra:
        path = CALCOM / p
        shutil.rmtree(path) if path.is_dir() else path.unlink(missing_ok=True)
    if schema:
        regen_prisma()
    left = sh(ENV + 'git status --porcelain -- . ":!**/node_modules"').stdout.strip()
    if left:
        raise SystemExit(f'workspace not clean after reset:\n{left[:2000]}')
    print(json.dumps({'reset': pull, 'removed_ignored': extra, 'prisma_regenerated': schema}))


def test_report(command, report, log, timeout):
    """A test startup failure is unavailable grading, not an empty passing set. Never reuse an old report."""
    report.unlink(missing_ok=True)
    timed_out = False
    try:
        r = sh(command, check=False, timeout=timeout)
        stdout, stderr, exit_code = r.stdout, r.stderr, r.returncode
    except subprocess.TimeoutExpired as e:
        text = lambda value: value.decode(errors='replace') if isinstance(value, bytes) else value or ''
        stdout, stderr, exit_code = text(e.stdout), text(e.stderr), None
        timed_out = True
    log.write_text(stdout + '\n' + stderr)
    try:
        if timed_out:
            raise ValueError(f'test command timed out after {timeout}s')
        j = json.loads(report.read_text())
        if not isinstance(j, dict) or not isinstance(j.get('testResults'), list):
            raise ValueError('test report has no testResults array')
        for f in j['testResults']:
            if not isinstance(f, dict) or not isinstance(f.get('name'), str) or not isinstance(f.get('assertionResults'), list):
                raise ValueError('invalid test file result')
            if f.get('message') is not None and not isinstance(f['message'], str):
                raise ValueError('invalid test file message')
            for a in f['assertionResults']:
                if not isinstance(a, dict) or not isinstance(a.get('title'), str) or not isinstance(a.get('status'), str):
                    raise ValueError('invalid test assertion result')
                ancestors = a.get('ancestorTitles', [])
                if not isinstance(ancestors, list) or any(not isinstance(title, str) for title in ancestors):
                    raise ValueError('invalid test ancestor titles')
        return j, None
    except (OSError, ValueError, TypeError) as e:
        return None, {'message': str(e), 'exit_code': exit_code, 'timed_out': timed_out,
                      'log': str(log), 'stdout_tail': stdout[-1500:], 'stderr_tail': stderr[-1500:]}


def run_tests(t, label='tests'):
    report = TMP / 'vitest.json'
    j, error = test_report(
        ENV + t['test_cmd'].replace('yarn vitest', f'yarn vitest --reporter=json --outputFile={report}')
        .replace('TZ=UTC ', ''), report, RESULTS / f'{t["pull"]}-{label}-tests.log', 1800)
    res = {}
    if j is not None:
        for f in j['testResults']:
            name = os.path.relpath(f['name'], CALCOM)
            for a in f.get('assertionResults', []):
                res[f"{name}::{' > '.join(a.get('ancestorTitles', []) + [a['title']])}"] = a['status']
            if not f.get('assertionResults'):
                res[f'{name}::<file>'] = str(f.get('status')) + ': ' + (f.get('message') or '')[:300]
        report.unlink(missing_ok=True)
    f2p = {k: res.get(k, 'missing') for k in t['f2p']}
    return f2p, res, error


def add_tests(t):
    for f in t['test_files'] + t['support_files']:
        sh(realgit(f'show {t["merge"]}:{f}') + f' > {TMP}/testfile && mkdir -p "{CALCOM}/{os.path.dirname(f)}" && cp {TMP}/testfile "{CALCOM}/{f}"')


def regen_prisma():
    sh(ENV + f'cd packages/prisma && yarn post-install > {TMP}/regen.log 2>&1', check=False, timeout=900)


def check(pull):
    t = task(pull)
    add_tests(t)
    f2p, _, base_error = run_tests(t, 'check-base')
    base_pass = sum(v == 'passed' for v in f2p.values())
    excl = ' '.join(f"':(exclude){f}'" for f in t['test_files'] + t['support_files'])
    sh(realgit(f'diff --binary {t["base"]} {t["merge"]} -- . {excl}') + f' > {TMP}/gold.diff && cd {CALCOM} && git apply --whitespace=nowarn {TMP}/gold.diff')
    schema = 'packages/prisma/schema.prisma' in open(TMP / 'gold.diff').read()
    if schema:
        regen_prisma()
    f2p2, res, gold_error = run_tests(t, 'check-gold')
    gold_pass = sum(v == 'passed' for v in f2p2.values())
    sh(ENV + 'git checkout -q -- . && git clean -q -fd -e node_modules -e "**/node_modules"')
    if schema:
        regen_prisma()
    out = {'pull': pull, 'f2p': len(t['f2p']), 'pass_at_base': base_pass, 'pass_with_gold_patch': gold_pass,
           'gold_patch': 'full PR diff minus its test files' + (' (schema regenerated)' if schema else ''),
           'gold_failures': {k: v for k, v in f2p2.items() if v != 'passed'},
           'base_execution_error': base_error, 'gold_execution_error': gold_error}
    print(json.dumps(out, indent=1)[:3000])
    json.dump(out, open(RESULTS / f'{pull}-check.json', 'w'), indent=1)


def full_suite(tag):
    """Full unit suite (TZ=UTC, isolation on). Returns (passing ids or None, execution error). Exit code is ignored: vitest can exit 1
    on a late promise-rejection warning with every test passing, so the JSON report is the record."""
    out = RESULTS / f'suite-{tag}.json'
    t0 = time.time()
    j, error = test_report(ENV + f'TZ=UTC yarn vitest run --reporter=json --outputFile={out}',
                           out, RESULTS / f'suite-{tag}.log', 5400)
    if error:
        print(f'full suite {tag}: unavailable; see {error["log"]}')
        return None, error
    passed = {f"{os.path.relpath(f['name'], CALCOM)}::{' > '.join(a.get('ancestorTitles', []) + [a['title']])}"
              for f in j['testResults'] for a in f['assertionResults'] if a['status'] == 'passed'}
    print(f'full suite {tag}: {len(passed)} passed, {j.get("numFailedTests", 0)} failed, {time.time()-t0:.0f}s')
    return passed, None


def baseline(pull):
    """Run at base, before the agent: tests that pass on two runs form the regression set."""
    output = RESULTS / f'{pull}-baseline.json'
    output.unlink(missing_ok=True)
    a, error = full_suite(f'{pull}-base-1')
    if error:
        raise SystemExit(f'Baseline unavailable: {json.dumps(error)}')
    b, error = full_suite(f'{pull}-base-2')
    if error:
        raise SystemExit(f'Baseline unavailable: {json.dumps(error)}')
    stable = sorted(a & b)
    json.dump({'pull': pull, 'stable_passing': stable, 'flaky': sorted(a ^ b)},
              open(output, 'w'), indent=0)
    print(f'baseline: {len(stable)} stable, {len(a ^ b)} flaky')


def evaluate(pull, label, regress=False):
    t = task(pull)
    diff = sh(ENV + 'git add -A . >/dev/null 2>&1; git diff --cached --stat -- . ":!**/node_modules"; git diff --cached --name-status', check=False).stdout
    changed = sorted({l.split('\t')[-1] for l in diff.splitlines() if re.match(r'^[AMDR]\d*\t', l)})
    sh(ENV + f'git diff --cached > {RESULTS}/{pull}-{label}.diff', check=False)
    test_set = set(t['test_files']) | set(t['support_files'])
    agent_src = [c for c in changed if c not in test_set and not re.search(r'\.(test|spec)\.', c)]
    if 'packages/prisma/schema.prisma' in changed:
        regen_prisma()
    add_tests(t)
    f2p, res, test_error = run_tests(t, label)
    gold = set(paths(t['source_files']))
    hit = sorted(set(agent_src) & gold)
    out = {'pull': pull, 'label': label, 'f2p_passed': sum(v == 'passed' for v in f2p.values()), 'f2p_total': len(f2p),
           'resolved': test_error is None and all(v == 'passed' for v in f2p.values()),
           'agent_files': agent_src, 'pr_files': sorted(gold), 'pr_files_touched': hit,
           'file_recall': round(len(hit) / len(gold), 3) if gold else None,
           'file_precision': round(len(hit) / len(agent_src), 3) if agent_src else None,
           'f2p_status': f2p, 'test_execution_error': test_error}
    if regress:
        base = set(json.load(open(RESULTS / f'{pull}-baseline.json'))['stable_passing'])
        now, error = full_suite(f'{pull}-{label}')
        broke = None if now is None else sorted(base - now - set(t['f2p']))
        out['regressions'] = {'baseline_stable_passing': len(base), 'broken': None if broke is None else len(broke),
                              'broken_tests': broke, 'execution_error': error}
    print(json.dumps({k: v for k, v in out.items() if k not in ('f2p_status', 'regressions')}
                     | ({'regressions': out['regressions']['broken']} if regress else {}), indent=1))
    json.dump(out, open(RESULTS / f'{pull}-{label}.json', 'w'), indent=1)


def restore(pull=None, quiet=False):
    if HIDDEN.exists():
        if (CALCOM / '.git' / 'packed-refs').exists():
            raise SystemExit(f'{CALCOM}/.git looks like a real clone (packed-refs) and {HIDDEN} exists too: inspect both before restoring')
        shutil.rmtree(CALCOM / '.git', ignore_errors=True)
        shutil.move(str(HIDDEN), str(CALCOM / '.git'))
        if not quiet:
            print('history restored')


if __name__ == '__main__':
    RESULTS.mkdir(parents=True, exist_ok=True)
    TMP.mkdir(parents=True, exist_ok=True)
    cmd, pull = sys.argv[1], int(sys.argv[2])
    if cmd == 'evaluate':
        evaluate(pull, sys.argv[3], regress='--regress' in sys.argv[4:])
    else:
        {'prepare': prepare, 'check': check, 'restore': restore, 'baseline': baseline, 'reset': reset}[cmd](pull)
