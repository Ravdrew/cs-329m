"""Rank mined PRs as SWE-bench-style candidates.

Usage: python3 -I filter_candidates.py prs.json [limit]
Keeps PRs that (a) add at least one unit test file, (b) change at least one
non-test source file, (c) do not live in areas removed from cal.diy
(workflows, routing forms, orgs/teams, insights, API v1, instant booking,
AI phone, RAQB/attributes, SAML, booking audit).
"""
import json
import re
import sys

prs = json.load(open(sys.argv[1]))
limit = int(sys.argv[2]) if len(sys.argv) > 2 else 80

REMOVED = re.compile(
    r"routing-forms|routing_forms|/workflows/|features/ee/workflows|insights|/organizations/|/teams/|"
    r"apps/api/v1|instant|ai-phone|cal-ai|calai|raqb|attributes|/saml|sso|booking-audit|bookingAudit|"
    r"impersonat|credits|billing|license|/ee/|platform/atoms|apps/api/v2",
    re.I,
)
SKIP_TITLE = re.compile(r"^(chore|ci|docs|test|tests|refactor|revert|perf|style|build)\b|\bbump\b|\bi18n\b|\btranslation", re.I)

def area(paths):
    counts = {}
    for p in paths:
        p = p.split(":", 1)[-1]
        parts = p.split("/")
        key = "/".join(parts[:3]) if parts[0] == "packages" else "/".join(parts[:2])
        counts[key] = counts.get(key, 0) + 1
    return sorted(counts, key=counts.get, reverse=True)[:3]

cands = []
for r in prs:
    if not r["added_unit_tests"]:
        continue
    src = [p for p in r["source_files"] if not p.startswith("D:")]
    if not src:
        continue
    all_paths = src + r["added_unit_tests"] + r["modified_unit_tests"]
    if any(REMOVED.search(p) for p in all_paths):
        continue
    if SKIP_TITLE.search(r["title"]):
        continue
    n_src = len(src)
    score = 0
    t = r["title"].lower()
    if t.startswith("feat"):
        score += 3
    elif t.startswith("fix"):
        score += 1
    if 1 <= n_src <= 12:
        score += 2
    elif n_src <= 25:
        score += 1
    score += min(len(r["added_unit_tests"]), 2)
    cands.append({**r, "n_src": n_src, "score": score, "areas": area(src)})

cands.sort(key=lambda c: (-c["score"], -len(c["added_unit_tests"]), c["n_src"]))
print(f"{len(cands)} candidates after filtering\n")
for c in cands[:limit]:
    print(f"#{c['pr']:<6} {c['date']} s={c['score']} src={c['n_src']:<3} tests+={len(c['added_unit_tests'])} ~={len(c['modified_unit_tests'])}  {c['title'][:90]}")
    print(f"        areas: {', '.join(c['areas'])}")
json.dump(cands, open(sys.argv[1].replace(".json", "_candidates.json"), "w"), indent=1)
