# Benchmark mining for cal.diy

See `docs/benchmark-pr-audit.md` for results. To reproduce:

```bash
# 1. blob-less clone (fast) and a full worktree for running tests
git clone --filter=blob:none --no-tags --single-branch --branch main https://github.com/calcom/cal.diy.git cal.diy
git -C cal.diy worktree add --detach ../work main
(cd work && yarn install)

# 2. mine + filter
python3 -I scripts/mine_prs.py cal.diy 2025-01-01 prs_since_2025.json
python3 -I scripts/filter_candidates.py prs_since_2025.json 90      # writes prs_since_2025_candidates.json

# 3. verify FAIL_TO_PASS for a chosen set (verify_set.json is a subset of the candidates file)
python3 -I scripts/verify_prs.py work verify_set.json verify_results.jsonl            # all
python3 -I scripts/verify_prs.py work verify_set.json verify_results.jsonl --prs 123,456

# 4. metadata + summary
python3 -I scripts/fetch_pr_meta.py verify_set.json pr_meta.json
python3 -I scripts/summarize.py verify_results.jsonl prs_since_2025_candidates.json pr_meta.json tasks.json table.md
```

`verify_prs.py` is resumable (skips PRs already in the results file) and re-runs
`yarn install` only when `yarn.lock` changes between checkouts.
