"""Mine cal.diy git history for squash-merged PRs that add tests.

Usage: python3 -I mine_prs.py <repo-path> <since-date> <out.json>

For each commit on main whose subject ends with "(#NNNN)", records the files it
added/modified/deleted (no blobs needed; works on a blob-less clone) and
classifies them into unit tests, e2e tests, and source files.
"""
import json
import re
import subprocess
import sys

repo, since, out = sys.argv[1], sys.argv[2], sys.argv[3]

UNIT_TEST = re.compile(r"(\.(test|spec)\.(ts|tsx|js|jsx|mts)$)|(/__tests__/)")
E2E_TEST = re.compile(r"(\.e2e\.ts$)|(/playwright/)|(apps/web/playwright)")
NON_CODE = re.compile(r"(\.(md|mdx|json|lock|yaml|yml|snap|sql|svg|png|jpg|css|scss|prisma)$)|(^\.github/)|(^docs/)|(^apps/docs/)")

log = subprocess.run(
    ["git", "-C", repo, "log", "--since", since, "--format=%x00%H%x09%ad%x09%s", "--date=short",
     "--name-status", "--no-renames", "main"],
    capture_output=True, text=True, check=True,
).stdout

records = []
for chunk in log.split("\x00"):
    if not chunk.strip():
        continue
    header, _, body = chunk.partition("\n")
    sha, date, subject = header.split("\t", 2)
    m = re.search(r"\(#(\d+)\)\s*$", subject)
    if not m:
        continue
    pr = int(m.group(1))
    added_unit, mod_unit, added_e2e, mod_e2e, src = [], [], [], [], []
    for line in body.splitlines():
        if not line.strip():
            continue
        status, _, path = line.partition("\t")
        status = status[0]
        if E2E_TEST.search(path):
            (added_e2e if status == "A" else mod_e2e).append(path)
        elif UNIT_TEST.search(path) and not path.endswith(".snap"):
            (added_unit if status == "A" else mod_unit).append(path)
        elif not NON_CODE.search(path):
            src.append(f"{status}:{path}")
    records.append({
        "sha": sha, "date": date, "pr": pr, "title": re.sub(r"\s*\(#\d+\)\s*$", "", subject),
        "added_unit_tests": added_unit, "modified_unit_tests": mod_unit,
        "added_e2e_tests": added_e2e, "modified_e2e_tests": mod_e2e,
        "source_files": src,
    })

with open(out, "w") as f:
    json.dump(records, f, indent=1)

n = len(records)
with_tests = [r for r in records if r["added_unit_tests"] or r["modified_unit_tests"] or r["added_e2e_tests"] or r["modified_e2e_tests"]]
with_added = [r for r in records if r["added_unit_tests"] or r["added_e2e_tests"]]
feat = [r for r in with_tests if r["title"].lower().startswith("feat")]
print(f"PR commits: {n}; touching tests: {len(with_tests)}; adding new test files: {len(with_added)}; feat + tests: {len(feat)}")
