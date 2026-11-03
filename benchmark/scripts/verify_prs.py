"""SWE-bench-style FAIL_TO_PASS verification for cal.diy PR candidates.

Usage: python3 -I verify_prs.py <worktree> <candidates.json> <out.jsonl> [--prs 123,456] [--max N]

For each candidate (merge commit C, parent P):
  1. checkout P, apply the PR's test files from C, run vitest on them  -> "before"
  2. checkout C, run the same test files                               -> "after"
A candidate is confirmed when at least one test fails before and passes after,
and no test that passed before fails after.
yarn install is re-run only when yarn.lock changes between checkouts.
"""
import hashlib
import json
import os
import subprocess
import sys
import time

worktree, cand_path, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
only = None
max_n = None
if "--prs" in sys.argv:
    only = {int(x) for x in sys.argv[sys.argv.index("--prs") + 1].split(",")}
if "--max" in sys.argv:
    max_n = int(sys.argv[sys.argv.index("--max") + 1])

def sh(cmd, timeout=None, env=None, check=True):
    return subprocess.run(cmd, cwd=worktree, capture_output=True, text=True, timeout=timeout, check=check,
                          env={**os.environ, **(env or {})})

def lock_hash():
    p = os.path.join(worktree, "yarn.lock")
    return hashlib.sha1(open(p, "rb").read()).hexdigest() if os.path.exists(p) else ""

installed_lock = lock_hash()

def checkout(sha):
    global installed_lock
    sh(["git", "checkout", "--", "."])
    sh(["git", "clean", "-fdq"])
    sh(["git", "checkout", "--detach", "-q", sha], timeout=1800)
    h = lock_hash()
    if h != installed_lock:
        t = time.time()
        r = sh(["yarn", "install"], timeout=2400, check=False, env={"HUSKY": "0", "CI": "1"})
        print(f"    yarn install at {sha[:8]}: exit {r.returncode} in {time.time()-t:.0f}s", flush=True)
        installed_lock = h
        install_log[sha] = (r.stdout + r.stderr)[-2500:]
        return r.returncode
    return 0

install_log = {}

def run_tests(files):
    report = os.path.abspath(os.path.join(os.path.dirname(out_path), ".vitest-report.json"))
    if os.path.exists(report):
        os.remove(report)
    t = time.time()
    try:
        r = sh(["yarn", "vitest", "run", "--reporter=json", f"--outputFile={report}", *files],
               timeout=900, check=False, env={"TZ": "UTC", "CI": "1"})
        rc = r.returncode
        tail = (r.stdout + r.stderr)[-3000:]
    except subprocess.TimeoutExpired:
        rc, tail = -1, "TIMEOUT"
    tests = {}
    report_found = os.path.exists(report)
    if report_found:
        try:
            data = json.load(open(report))
            for f in data.get("testResults", []):
                rel = os.path.relpath(f["name"], worktree)
                if not f.get("assertionResults"):
                    tests[f"{rel}::<file>"] = f.get("status", "failed")
                for a in f.get("assertionResults", []):
                    name = " > ".join([*a.get("ancestorTitles", []), a["title"]])
                    tests[f"{rel}::{name}"] = a["status"]
        except Exception as e:  # noqa
            tail += f"\nreport parse error: {e}"
    return {"exit": rc, "seconds": round(time.time() - t, 1), "tests": tests, "report_found": report_found, "tail": tail}

cands = json.load(open(cand_path))
if only:
    cands = [c for c in cands if c["pr"] in only]
cands.sort(key=lambda c: c["date"], reverse=True)  # newest first: fewer lockfile churns
if max_n:
    cands = cands[:max_n]

done = set()
if os.path.exists(out_path):
    for line in open(out_path):
        try:
            done.add(json.loads(line)["pr"])
        except Exception:
            pass

for c in cands:
    if c["pr"] in done:
        continue
    sha = c["sha"]
    parent = sh(["git", "rev-parse", f"{sha}^"]).stdout.strip()
    test_files = c["added_unit_tests"] + c["modified_unit_tests"]
    print(f"== PR #{c['pr']} {c['date']} {c['title'][:70]}  ({len(test_files)} test files)", flush=True)
    rec = {"pr": c["pr"], "sha": sha, "parent": parent, "title": c["title"], "date": c["date"],
           "test_files": test_files, "source_files": c["source_files"]}
    try:
        rec["install_before"] = checkout(parent)
        rec["install_before_log"] = install_log.get(parent, "")
        # bring in the PR's tests (added ones don't exist at P)
        sh(["git", "checkout", sha, "--", *test_files], check=False)
        rec["before"] = run_tests(test_files)
        rec["install_after"] = checkout(sha)
        rec["install_after_log"] = install_log.get(sha, "")
        rec["after"] = run_tests(test_files)
        b, a = rec["before"]["tests"], rec["after"]["tests"]
        f2p = sorted(t for t, s in a.items() if s == "passed" and b.get(t, "failed") != "passed")
        p2p = sorted(t for t, s in a.items() if s == "passed" and b.get(t) == "passed")
        p2f = sorted(t for t, s in b.items() if s == "passed" and a.get(t) != "passed")
        rec["FAIL_TO_PASS"] = f2p
        rec["PASS_TO_PASS"] = p2p
        rec["PASS_TO_FAIL"] = p2f
        rec["after_all_pass"] = rec["after"]["exit"] == 0 and bool(a)
        rec["confirmed"] = bool(f2p) and rec["after_all_pass"] and not p2f
        print(f"   before: exit {rec['before']['exit']} ({sum(1 for s in b.values() if s=='passed')}/{len(b)} pass, {rec['before']['seconds']}s)"
              f"  after: exit {rec['after']['exit']} ({sum(1 for s in a.values() if s=='passed')}/{len(a)} pass, {rec['after']['seconds']}s)"
              f"  F2P={len(f2p)} P2F={len(p2f)}  -> {'CONFIRMED' if rec['confirmed'] else 'no'}", flush=True)
    except Exception as e:  # noqa
        rec["error"] = repr(e)[:2000]
        print(f"   ERROR {rec['error'][:300]}", flush=True)
    with open(out_path, "a") as f:
        f.write(json.dumps(rec) + "\n")

sh(["git", "checkout", "--", "."], check=False)
print("done", flush=True)
