"""Fetch PR title/body/labels/author for the verify set via the unauthenticated GitHub API (60 req/h)."""
import json, sys, time, urllib.request
cands = json.load(open(sys.argv[1])); out = sys.argv[2]
meta = json.load(open(out)) if __import__("os").path.exists(out) else {}
for c in cands:
    pr = str(c["pr"])
    if pr in meta: continue
    req = urllib.request.Request(f"https://api.github.com/repos/calcom/cal.diy/pulls/{pr}", headers={"User-Agent": "cs329m-audit"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            d = json.load(r)
        meta[pr] = {k: d.get(k) for k in ["title", "body", "merged_at", "html_url", "additions", "deletions", "changed_files"]}
        meta[pr]["labels"] = [l["name"] for l in d.get("labels", [])]
        meta[pr]["author"] = (d.get("user") or {}).get("login")
        print("ok", pr, d.get("title", "")[:60])
    except Exception as e:
        print("fail", pr, e); 
        if "403" in str(e): break
    time.sleep(1)
json.dump(meta, open(out, "w"), indent=1)
