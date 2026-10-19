"""Build tasks.json (SWE-bench-style instances) and a markdown table from verify_results.jsonl.

Usage: python3 -I summarize.py verify_results.jsonl prs_since_2025_candidates.json pr_meta.json tasks.json table.md
"""
import json, sys, re
res_path, cand_path, meta_path, tasks_out, table_out = sys.argv[1:6]
results = [json.loads(l) for l in open(res_path)]
cands = {c["pr"]: c for c in json.load(open(cand_path))}
meta = json.load(open(meta_path))

def area(src):
    counts = {}
    for p in src:
        p = p.split(":", 1)[-1]
        parts = p.split("/")
        key = "/".join(parts[:3]) if parts[0] == "packages" else "/".join(parts[:2])
        counts[key] = counts.get(key, 0) + 1
    return ", ".join(sorted(counts, key=counts.get, reverse=True)[:2])

tasks, rows = [], []
for r in sorted(results, key=lambda r: (not r.get("confirmed"), r["date"]), reverse=False):
    c = cands[r["pr"]]
    m = meta.get(str(r["pr"]), {})
    src = [p for p in r["source_files"] if not p.startswith("D:")]
    status = "confirmed" if r.get("confirmed") else ("error" if r.get("error") else "not confirmed")
    why = ""
    if not r.get("confirmed"):
        if r.get("error"): why = "runner error"
        elif r.get("install_before") or r.get("install_after"): why = "yarn install failed at that commit"
        elif r.get("PASS_TO_FAIL"): why = f"{len(r['PASS_TO_FAIL'])} tests fail after the PR too (flaky/env-dependent)"
        elif not r.get("FAIL_TO_PASS"): why = "new tests already pass before the PR (tests do not pin the behaviour)"
        elif not r.get("after_all_pass"): why = "tests do not all pass at the PR commit"
    rows.append((r["pr"], r["date"], r["title"], area(src), len(src), len(r.get("FAIL_TO_PASS", [])), len(r.get("PASS_TO_PASS", [])), status, why, m.get("additions"), m.get("deletions")))
    if r.get("confirmed"):
        tasks.append({
            "instance_id": f"calcom__cal.diy-{r['pr']}",
            "repo": "calcom/cal.diy",
            "pull_number": r["pr"],
            "html_url": m.get("html_url", f"https://github.com/calcom/cal.diy/pull/{r['pr']}"),
            "title": r["title"],
            "merged_at": m.get("merged_at"),
            "base_commit": r["parent"],
            "merge_commit": r["sha"],
            "problem_statement": m.get("body") or "",
            "source_files": src,
            "test_files": r["test_files"],
            "FAIL_TO_PASS": r["FAIL_TO_PASS"],
            "PASS_TO_PASS": r["PASS_TO_PASS"],
            "test_cmd": "TZ=UTC yarn vitest run " + " ".join(r["test_files"]),
            "areas": area(src),
        })
json.dump(tasks, open(tasks_out, "w"), indent=1)
with open(table_out, "w") as f:
    f.write("| PR | Merged | Title | Main areas | Src files | +/- lines | F2P tests | P2P tests | Status | Note |\n|---|---|---|---|---|---|---|---|---|---|\n")
    for pr, date, title, ar, n, f2p, p2p, st, why, add, dele in rows:
        t = title.replace("|", "\\|")[:80]
        f.write(f"| [#{pr}](https://github.com/calcom/cal.diy/pull/{pr}) | {date} | {t} | {ar} | {n} | +{add}/-{dele} | {f2p} | {p2p} | {st} | {why} |\n")
print(f"{len(tasks)} confirmed of {len(results)}")
