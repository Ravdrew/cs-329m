"""Score candidate component graphs against a reference graph (Q1).

Usage:
    python3 scoring/score_graph.py --reference REF.yaml --ownership OWN.json [--adjudications ADJ.yaml]
        [--questions Q.json] [--tasks tasks.json] [--source-repo PATH] [--commit SHA]
        [--schema schema/graph.schema.json] [--out-dir scoring/out] [--name NAME ...] CANDIDATE [...]

Nothing about the reference is built in: node ids, paths and counts all come from the inputs.
Rules (scoring/README.md has the full definitions):

  * paths       - candidate paths lose a leading ./ or /, use / separators, and lose the source-repo
                  prefix when absolute. A directory entry (ends with /, or has no extension and prefixes
                  known paths) or a glob (*) expands to the ownership-universe paths under/matching it plus,
                  with --source-repo, every source file at the pinned commit under/matching it.
                  Each node's expanded paths are de-duplicated.
  * voting      - a node's voting files are its expanded paths whose ownership owner is a node id.
  * strict map  - S(a) = reference node owning the plurality of a's voting files; a tie maps to nothing.
                  Model/external candidate nodes are matched by name first (exact name, then maximal runs of
                  label/id tokens, then schema-file line ranges, see make_by_name); nodes with no voting files
                  fall back to the exact name match.
  * tolerant map- T(a) = S(a) plus every reference node r for which a holds the most of r's files among all
                  candidate nodes (ties: every tied node). T is the headline map; S is reported alongside.
  * nodes       - recall = reference nodes in the union of T(a) / reference nodes; precision = candidate
                  nodes with non-empty T(a) / candidate nodes not outside reference scope (a node is outside
                  scope when T(a) is empty and it has 1+ files, all out_of_scope or not in ownership).
  * edges       - a reference fact is a directed pair of reference nodes (parallel edges count once);
                  adjudicated-true pairs join it. A candidate edge a->b is unmapped if M(a) or M(b) is empty,
                  collapsed if M(a)xM(b) holds only self pairs, else P(e) = {(x,y) in M(a)xM(b), x != y}.
                  TP edge if P(e) meets R (it covers those pairs); else confirmed FP if every pair in P(e) is
                  adjudicated false; else pending human review. Distinct candidate pairs C = covered pairs plus
                  P(e) of every non-TP edge (other pairs of a TP edge are not counted against it).
                  precision_decided = TP/(TP+FP), precision_lower = TP/(TP+FP+pending),
                  precision_upper = (TP+pending)/(TP+FP+pending), recall = covered/|R|, F1 from decided.
  * route/API   - the same restricted to pairs whose target reference node is a page or endpoint.
  * kind agree  - covered pairs with a reference kind where some covering edge's mapped kind matches.
  * grouping    - pairwise precision/recall over reference-assigned files the candidate lists (first listing
                  wins), plus coverage.
  * questions   - has/does-not-have questions answered under T; localization - task source files found in
                  nodes (tests, mocks, test utilities and non-code files are not targets), with the reference
                  ownership scored the same way as a baseline (shared files listed under each member node); coherence - schema, referential and citation
                  checks at the pinned commit. Build cost is copied, never scored.
"""
import argparse
import fnmatch
import hashlib
import json
import re
import subprocess
import sys
from collections import Counter, defaultdict
from math import comb
from pathlib import Path

import yaml

REPO = Path(__file__).resolve().parents[1]
NON_NODE = ('shared', 'out_of_scope')
DEFAULT_KINDS = {'edges': {'emits': 'calls', 'uses': 'calls'}, 'nodes': {'job': 'service', 'external': 'service'}}
ROUTE_KINDS = ('page', 'endpoint')
# Q1 localization targets and directory expansion: production code only, one rule for every task and graph.
CODE = re.compile(r'\.(ts|tsx|js|jsx|mjs|cjs)$')
TEST = re.compile(r'(\.test\.|\.spec\.|\.e2e\.|\.integration-test\.|/test/|/tests/|__tests__|__mocks__|/mocks?/|'
                  r'\.stories\.|/testing/|fixtures|/playwright/|testUtils|test-utils)')


def is_source(p):
    return bool(CODE.search(p)) and not TEST.search(p) and 'node_modules/' not in p


class InputError(Exception):
    pass


def load(path):
    try:
        text = Path(path).read_text()
        return json.loads(text) if str(path).endswith('.json') else yaml.safe_load(text)
    except (OSError, ValueError, yaml.YAMLError) as ex:
        raise InputError(f'cannot read {path}: {ex}') from ex


def leaks_into_repo(out, reference):
    """True when output derived from an out-of-repo (real) reference would be written inside this repo."""
    inside = lambda x: Path(x).resolve() == REPO or REPO in Path(x).resolve().parents
    return inside(out) and not inside(reference)


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def ratio(a, b):
    return a / b if b else None


def f2(p, r):
    """F-beta with beta=2: recall weighs four times precision (a missed file costs an agent more than an extra one)."""
    return None if p is None or r is None else (5 * p * r / (4 * p + r) if p + r else 0.0)


def f1(p, r):
    return None if p is None or r is None else (2 * p * r / (p + r) if p + r else 0.0)


def hashable(x):
    return x if isinstance(x, (str, int, float, bool, type(None))) else repr(x)


def as_list(x):
    return x if isinstance(x, list) else []


def kind_mapping(ref):
    km = ((ref.get('x-scoring') or {}).get('kind_mapping') or {})
    source = 'x-scoring' if km else 'default'
    km = km or DEFAULT_KINDS
    return {'edges': dict(km.get('edges') or {}), 'nodes': dict(km.get('nodes') or {}), 'source': source}


def file_entries(node):
    """(path, lines) for each well-formed file entry of a node."""
    out = []
    for f in as_list(node.get('files')):
        if isinstance(f, str):
            out.append((f, None))
        elif isinstance(f, dict) and isinstance(f.get('path'), str):
            out.append((f['path'], f.get('lines')))
    return out


def norm_path(p, repo_root=None):
    p = str(p).replace('\\', '/')
    if repo_root and p.startswith('/'):
        root = str(Path(repo_root).resolve()).rstrip('/') + '/'
        for r in {root, str(Path(repo_root)).rstrip('/') + '/'}:
            if r in p:
                p = p[p.index(r) + len(r):]
                break
    while p.startswith('./') or p.startswith('/'):
        p = p[2:] if p.startswith('./') else p[1:]
    return p


class Universe:
    """Ownership file universe: owners, named nodes, directory/glob expansion."""

    def __init__(self, ownership, repo_files=()):
        self.own = {p: (r or {}).get('owner') for p, r in (ownership.get('files') or {}).items()}
        self.reasons = {p: (r or {}).get('reason') for p, r in (ownership.get('files') or {}).items()}
        self.members = {p: [m for m in (r or {}).get('candidates') or [] if m not in NON_NODE]
                        for p, r in (ownership.get('files') or {}).items() if (r or {}).get('owner') == 'shared'}
        self.named = ownership.get('named_nodes') or {}
        self.paths = sorted(self.own)
        # directory/glob entries expand over the universe and, when a source repo is given, every source file
        # at the pinned commit, so a graph that lists a directory outside the reference still gets its files
        self.expandable = sorted(set(self.paths) | {f for f in repo_files if is_source(f)})

    def node_owner(self, p):
        o = self.own.get(p)
        return o if o and o not in NON_NODE else None

    def is_dir(self, p):
        last = p.rstrip('/').rsplit('/', 1)[-1]
        return p.endswith('/') or ('.' not in last and any(q.startswith(p + '/') for q in self.expandable))

    def expand(self, p):
        """List of universe/source paths for a directory/glob entry, or None if p is a plain file entry."""
        if '*' in p:
            return [q for q in self.expandable if fnmatch.fnmatchcase(q, p)]
        if self.is_dir(p):
            d = p.rstrip('/') + '/'
            return [q for q in self.expandable if q.startswith(d)]
        return None


def prepare_graph(g, uni, repo_root=None):
    """Normalise a graph: first occurrence of each node id wins; per-node expanded, de-duplicated paths."""
    g = g if isinstance(g, dict) else {}
    nodes, seen = [], set()
    expanded = added = 0
    for n in as_list(g.get('nodes')):
        if not isinstance(n, dict) or not isinstance(n.get('id'), str) or n['id'] in seen:
            continue
        seen.add(n['id'])
        paths, entries = [], []
        for raw, lines in file_entries(n):
            p = norm_path(raw, repo_root)
            entries.append((p, lines))
            ex = uni.expand(p)
            if ex is None:
                paths.append(p)
            else:
                expanded += 1
                added += len(ex)
                paths.extend(ex)
        nodes.append({'id': n['id'], 'label': str(n.get('label') or ''), 'kind': n.get('kind'),
                      'entries': entries, 'paths': list(dict.fromkeys(paths)), 'raw': n})
    edges = []
    for i, e in enumerate(as_list(g.get('edges'))):
        if isinstance(e, dict):
            edges.append({'id': str(e.get('id') or f'#{i}'), 'from': hashable(e.get('from')), 'to': hashable(e.get('to')),
                          'kind': hashable(e.get('kind')), 'label': e.get('label'), 'evidence': e.get('evidence')})
    return {'nodes': nodes, 'by_id': {n['id']: n for n in nodes}, 'edges': edges,
            'expansion': {'entries_expanded': expanded, 'paths_added': added}}


# ---------------------------------------------------------------- node mapping

def alnum(x):
    return ''.join(ch for ch in str(x).lower() if ch.isalnum())


def make_by_name(uni, ref_nodes):
    """by_name(node, loose) -> (strict ref id or None, set of tolerant ref ids).

    Exact: the label, last id segment or id equals a named node's name. Loose (model/external candidate
    nodes only), tried in order until one gives a match: contiguous runs of label/id tokens that equal a
    name, keeping only maximal runs ("User & Schedule" -> Schedule); then schema-file line ranges, where
    the tolerant set is every named node whose schema_lines are at least half covered and the strict
    match is the single one with the largest overlap."""
    index = {alnum(nm): rid for rid, info in uni.named.items() for nm in info.get('names', [])}
    schema_files = {rid: {norm_path(p) for p, _ in file_entries(ref_nodes.get(rid, {}))} | {info.get('schema_file')}
                    for rid, info in uni.named.items() if info.get('schema_lines')}

    def tokens_match(n):
        found = []  # (start, end, rid)
        for text in (n['label'], n['id']):
            toks = [t for t in re.split(r'[^a-z0-9]+', re.sub(r'([a-z0-9])([A-Z])', r'\1 \2', text).lower()) if t]
            spans = [(i, j, index[''.join(toks[i:j])]) for i in range(len(toks)) for j in range(i + 1, len(toks) + 1)
                     if ''.join(toks[i:j]) in index]
            found += [s for s in spans if not any(o[0] <= s[0] and s[1] <= o[1] and o != s for o in spans)]
        return {rid for _, _, rid in found}

    def lines_match(n):
        overlap = Counter()
        for p, lines in n['entries']:
            if not (isinstance(lines, list) and len(lines) == 2 and all(isinstance(v, int) for v in lines)):
                continue
            for rid, files in schema_files.items():
                lo, hi = uni.named[rid]['schema_lines']
                if p in files:
                    overlap[rid] += max(0, min(hi, lines[1]) - max(lo, lines[0]) + 1)
        tol = {rid for rid, o in overlap.items() if o and o * 2 >= uni.named[rid]['schema_lines'][1] - uni.named[rid]['schema_lines'][0] + 1}
        best = overlap.most_common(2)
        strict = best[0][0] if best and best[0][1] and (len(best) == 1 or best[1][1] < best[0][1]) else None
        return strict, tol | ({strict} if strict else set())

    def by_name(n, loose):
        for key in (n['label'], n['id'].split('.')[-1], n['id']):
            if alnum(key) in index:
                return index[alnum(key)], {index[alnum(key)]}
        if not loose:
            return None, set()
        tok = tokens_match(n)
        if tok:
            return (next(iter(tok)) if len(tok) == 1 else None), tok
        return lines_match(n)
    return by_name


def map_nodes(cand, uni, ref_nodes):
    by_name = make_by_name(uni, ref_nodes)
    strict, votes_by, named = {}, {}, {}
    for n in cand['nodes']:
        votes = Counter(uni.node_owner(p) for p in n['paths'] if uni.node_owner(p))
        votes_by[n['id']] = dict(votes)
        loose = n['kind'] in ('model', 'external')
        name, named[n['id']] = by_name(n, loose) if loose or not votes else (None, set())
        if name:
            strict[n['id']] = name
        elif votes and not named[n['id']]:
            (top, c), *rest = votes.most_common()
            if not rest or rest[0][1] < c:
                strict[n['id']] = top
    tolerant = {n['id']: ({strict[n['id']]} if n['id'] in strict else set()) | named[n['id']] for n in cand['nodes']}
    holders = defaultdict(Counter)  # ref node -> candidate node -> files of r it lists
    for n in cand['nodes']:
        for p in n['paths']:
            if uni.node_owner(p):
                holders[uni.node_owner(p)][n['id']] += 1
    for r, cnt in holders.items():
        best = max(cnt.values())
        for a, c in cnt.items():
            if c == best:
                tolerant[a].add(r)
    outside = [n['id'] for n in cand['nodes'] if not tolerant[n['id']] and n['paths']
               and all(uni.own.get(p) in (None, 'out_of_scope') for p in n['paths'])]
    return strict, tolerant, votes_by, outside


# ---------------------------------------------------------------- edges

def reference_pairs(ref, emap, adj_true):
    R, labels = defaultdict(set), defaultdict(list)
    for e in as_list(ref.get('edges')):
        R[(e['from'], e['to'])].add(emap.get(e['kind'], e['kind']))
        labels[(e['from'], e['to'])].append({'id': e.get('id'), 'kind': e['kind'], 'label': e.get('label')})
    for p in adj_true:
        R.setdefault(p, set())
    return R, labels


def score_edges(cand, M, R, adj_false, emap, ref_kind):
    unmapped = collapsed = 0
    covered = defaultdict(set)  # ref pair -> mapped kinds of covering edges
    C, pending_edges, fp_edges, tp_edges = set(), defaultdict(list), 0, 0
    for e in cand['edges']:
        A, B = M.get(e['from']) or set(), M.get(e['to']) or set()
        if not A or not B:
            unmapped += 1
            continue
        P = {(x, y) for x in A for y in B if x != y}
        if not P:
            collapsed += 1
            continue
        hit = P & set(R)
        if hit:
            tp_edges += 1
            for p in hit:
                covered[p].add(emap.get(e['kind'], e['kind']))
            C |= hit
            continue
        C |= P
        if P <= adj_false:
            fp_edges += 1
        else:
            for p in P - adj_false:
                pending_edges[p].append(e)

    def block(keep):
        Ck = {p for p in C if keep(p)}
        tp = len({p for p in Ck if p in R})
        fp = len({p for p in Ck if p not in R and p in adj_false})
        pend = len({p for p in Ck if p not in R and p not in adj_false})
        Rk = {p for p in R if keep(p)}
        pd, rec = ratio(tp, tp + fp), ratio(tp, len(Rk))
        return {'precision_decided': pd, 'precision_lower': ratio(tp, tp + fp + pend),
                'precision_upper': ratio(tp + pend, tp + fp + pend), 'recall': rec, 'f1': f1(pd, rec),
                'tp': tp, 'confirmed_fp': fp, 'pending': pend, 'candidate_pairs': len(Ck), 'reference_pairs': len(Rk)}

    res = block(lambda p: True)
    res.update({'tp_edges': tp_edges, 'confirmed_fp_edges': fp_edges,
                'pending_edges': len({id(e) for es in pending_edges.values() for e in es}),
                'unmapped_edges': unmapped, 'collapsed_edges': collapsed,
                'covered_pairs': sorted(map(list, covered)), 'missed_pairs': sorted(map(list, set(R) - set(covered)))})
    routes = block(lambda p: ref_kind.get(p[1]) in ROUTE_KINDS)
    kinded = [p for p in covered if R[p]]
    agree = {'agreement': ratio(sum(1 for p in kinded if covered[p] & R[p]), len(kinded)),
             'pairs_compared': len(kinded), 'pairs_without_reference_kind': len(covered) - len(kinded)}
    return res, routes, agree, pending_edges


# ---------------------------------------------------------------- file grouping

def file_grouping(cand, uni):
    owner, listers = {}, defaultdict(set)
    for n in cand['nodes']:
        for p in n['paths']:
            owner.setdefault(p, n['id'])
            listers[p].add(n['id'])
    assigned = {p: uni.node_owner(p) for p in uni.paths if uni.node_owner(p)}
    both = [p for p in assigned if p in owner]
    sz = lambda counter: sum(comb(v, 2) for v in counter.values())
    pr_ref = sz(Counter(assigned[p] for p in both))
    pr_cand = sz(Counter(owner[p] for p in both))
    pr_both = sz(Counter((assigned[p], owner[p]) for p in both))
    p, r = ratio(pr_both, pr_cand), ratio(pr_both, pr_ref)
    return {'precision': p, 'recall': r, 'f1': f1(p, r), 'tp': pr_both, 'candidate': pr_cand, 'reference': pr_ref,
            'coverage': ratio(len(both), len(assigned)), 'files_compared': len(both),
            'reference_files': len(assigned), 'files_listed_by_2plus_nodes': sum(len(v) > 1 for v in listers.values())}


# ---------------------------------------------------------------- questions

def answer(q, T, cand, listed):
    c = q.get('check') or {}
    if c.get('type') == 'node':
        return c.get('ref') in set().union(*T.values()) if T else False
    if c.get('type') == 'edge':
        want = (c.get('from'), c.get('to'))
        return any(want[0] in (T.get(e['from']) or ()) and want[1] in (T.get(e['to']) or ()) and want[0] != want[1]
                   for e in cand['edges'])
    if c.get('type') == 'files':
        paths = [norm_path(p) for p in c.get('paths', [])]
        return bool(paths) and sum(p in listed for p in paths) / len(paths) >= c.get('min_share', 0.5)
    raise InputError(f"question {q.get('id')}: unknown check type {c.get('type')!r}")


def score_questions(qdoc, T, cand):
    listed = {p for n in cand['nodes'] for p in n['paths']}
    rows = []
    for q in qdoc.get('questions', []):
        yes = answer(q, T, cand, listed)
        rows.append({**q, 'answer': yes, 'correct': yes == (q.get('polarity') == 'has')})

    def acc(rs):
        w = sum(r.get('weight', 1) for r in rs)
        return {'n': len(rs), 'correct': sum(r['correct'] for r in rs), 'accuracy': ratio(sum(r['correct'] for r in rs), len(rs)),
                'weighted_accuracy': ratio(sum(r.get('weight', 1) for r in rs if r['correct']), w)}
    group = lambda key: {k: acc([r for r in rows if key(r) == k]) for k in sorted({key(r) for r in rows})}
    return {'status': 'ok', 'question_status': qdoc.get('status'), 'provisional': qdoc.get('status') == 'PROVISIONAL',
            'overall': acc(rows), 'by_polarity': group(lambda r: r.get('polarity')),
            'by_category': group(lambda r: r.get('category')),
            'headline': {'has': acc([r for r in rows if r.get('polarity') == 'has']),
                         'does_not_have': acc([r for r in rows if r.get('polarity') == 'does_not_have' and r.get('category') != 'scope']),
                         'scope': acc([r for r in rows if r.get('category') == 'scope'])},
            'incorrect': [{k: r.get(k) for k in ('id', 'polarity', 'category', 'text', 'answer')} for r in rows if not r['correct']]}


# ---------------------------------------------------------------- source repo

class Source:
    def __init__(self, repo, commit):
        self.repo, self.commit, self._text, self._renames = repo, commit, {}, {}
        out = git(repo, 'ls-tree', '-r', '--name-only', '-z', commit)
        self.files = set(filter(None, out.split('\0')))
        self.dirs = {f.rsplit('/', i)[0] for f in self.files for i in range(1, f.count('/') + 1)}

    def lines(self, path):
        if path not in self._text:
            self._text[path] = git(self.repo, 'show', f'{self.commit}:{path}').splitlines()
        return self._text[path]

    def renames(self, since):
        """{old path: path at the pinned commit} for files renamed between commit `since` and the pinned commit
        (git rename detection, 50% similarity). Empty if `since` is not in the repo."""
        if since not in self._renames:
            try:
                out = git(self.repo, '-c', 'diff.renameLimit=0', 'diff', '-M50%', '--name-status', '-z',
                          '--diff-filter=R', since, self.commit)
            except InputError:
                out = ''
            f = out.split('\0')
            self._renames[since] = {f[i + 1]: f[i + 2] for i in range(0, len(f) - 2, 3) if f[i].startswith('R')}
        return self._renames[since]


def git(repo, *args):
    try:
        return subprocess.run(['git', '-C', str(repo), *args], check=True, capture_output=True).stdout.decode('utf-8', 'replace')
    except (subprocess.CalledProcessError, OSError) as ex:
        raise InputError(f"git {' '.join(args)} failed in {repo}: {getattr(ex, 'stderr', b'') or ex}") from ex


def strip_status(s):
    m = re.match(r'^[A-Z]\d*:(.*)$', s)
    rest = m.group(1) if m else s
    for sep in ('\t', ' -> ', ' => '):
        if sep in rest:
            rest = rest.split(sep)[-1]
    if m and s[0] in 'RC' and ':' in rest:
        rest = rest.rsplit(':', 1)[-1]
    return rest.strip()


def localization(tasks, listed_by, src, uni):
    """Per task: recall = eligible task files some node lists; precision = task files among all production source
    files (present at the commit) of the nodes those task files point to, so listing every file in a few big nodes
    is not free. Node size uses the same production-code rule as targets and directory expansion, so a node
    listing a.ts and a.test.ts by name scores the same as one listing their directory."""
    node_files = defaultdict(set)
    for f, ns in listed_by.items():
        if f in src.files and is_source(f):
            for a in ns:
                node_files[a].add(f)
    per, excluded, renamed, not_source = [], [], [], []
    for t in tasks:
        listed = list(dict.fromkeys(strip_status(s) for s in t.get('source_files', [])))
        files = [f for f in listed if is_source(f)]
        not_source += [{'task': t.get('pull_number') or t.get('instance_id'), 'path': f} for f in listed if not is_source(f)]
        absent = [f for f in files if f not in src.files]
        moved = src.renames(t['merge_commit']) if absent and t.get('merge_commit') else {}
        moved = {f: moved[f] for f in absent if moved.get(f) in src.files}
        renamed += [{'task': t.get('pull_number') or t.get('instance_id'), 'path': f, 'now': g} for f, g in moved.items()]
        ok = [f for f in dict.fromkeys(moved.get(f, f) for f in files if f in src.files or f in moved) if is_source(f)]
        excluded += [{'task': t.get('pull_number') or t.get('instance_id'), 'path': f} for f in absent if f not in moved]
        scope = [f for f in ok if uni.node_owner(f)]
        hits = lambda fs: sum(bool(listed_by.get(f)) for f in fs)
        pointed = sorted({a for f in ok for a in listed_by.get(f, ())})
        pool = set().union(*(node_files[a] for a in pointed)) if pointed else set()
        prec, rec = ratio(hits(ok), len(pool)), ratio(hits(ok), len(ok))
        per.append({'task': t.get('pull_number') or t.get('instance_id'), 'title': t.get('title'), 'files': len(files),
                    'eligible_files': len(ok), 'excluded_files': len(absent) - len(moved), 'renamed_files': len(moved), 'in_scope_files': len(scope),
                    'file_recall': rec, 'in_scope_recall': ratio(hits(scope), len(scope)),
                    'nodes_pointed': pointed, 'files_in_pointed_nodes': len(pool), 'precision': prec,
                    'f2': (f2(prec, rec) if prec is not None else 0.0) if ok else None, 'hit': hits(ok) > 0})
    mean = lambda xs: ratio(sum(xs), len(xs))
    elig = [p for p in per if p['eligible_files']]
    return {'tasks': len(per), 'tasks_with_eligible_files': len(elig),
            'tasks_with_in_scope_files': sum(1 for p in per if p['in_scope_files']),
            'file_recall_macro': mean([p['file_recall'] for p in elig]),
            'in_scope_recall_macro': mean([p['in_scope_recall'] for p in per if p['in_scope_recall'] is not None]),
            'hit_rate': mean([p['hit'] for p in elig]), 'hits': sum(p['hit'] for p in elig),
            'precision_macro': mean([p['precision'] for p in elig if p['precision'] is not None]),
            'f2_macro': mean([p['f2'] for p in elig]),
            'files_followed_through_renames': len(renamed), 'renamed': renamed,
            'files_excluded_absent_at_commit': len(excluded), 'excluded': excluded,
            'files_excluded_not_source': len(not_source), 'not_source': not_source, 'per_task': per}


# ---------------------------------------------------------------- coherence

def coherence(raw, cand, schema, src, pinned, repo_root):
    out = {}
    if schema is None:
        out['schema_valid'], out['schema_errors'] = None, 'skipped'
    else:
        from jsonschema import Draft202012Validator
        errs = sorted(Draft202012Validator(schema).iter_errors(raw), key=lambda e: list(map(str, e.absolute_path)))
        out['schema_valid'] = not errs
        out['schema_error_count'] = len(errs)
        out['schema_errors'] = [f"/{'/'.join(map(str, e.absolute_path))}: {e.message[:300]}" for e in errs[:50]]
    g = raw if isinstance(raw, dict) else {}
    nodes = [n for n in as_list(g.get('nodes')) if isinstance(n, dict)]
    edges = [e for e in as_list(g.get('edges')) if isinstance(e, dict)]
    groups = [x for x in as_list(g.get('groups')) if isinstance(x, dict)]
    ids, gids = {hashable(n.get('id')) for n in nodes}, {hashable(x.get('id')) for x in groups}
    dup = lambda xs: sorted(k for k, v in Counter(xs).items() if v > 1)
    ref = {
        'dangling_edges': [f"{e.get('id') or i}: {e.get('from')}->{e.get('to')}" for i, e in enumerate(edges)
                           if hashable(e.get('from')) not in ids or hashable(e.get('to')) not in ids],
        'unknown_group': [f"{n.get('id')}: {n['group']}" for n in nodes if n.get('group') and hashable(n['group']) not in gids],
        'unknown_group_parent': [f"{x.get('id')}: {x['parent']}" for x in groups
                                 if x.get('parent') and hashable(x['parent']) not in gids],
        'duplicate_node_ids': dup(str(n.get('id')) for n in nodes),
        'duplicate_edge_ids': dup(str(e['id']) for e in edges if e.get('id') is not None),
        'self_loop_edges': [f"{e.get('id') or i}: {e.get('from')}" for i, e in enumerate(edges) if e.get('from') == e.get('to')],
        'nodes_without_files': [str(n.get('id')) for n in nodes if not file_entries(n)],
    }
    out.update(ref)
    out['counts'] = {k: len(v) for k, v in ref.items()}
    declared = g.get('commit')
    out['declared_commit'] = declared
    out['commit_matches_pinned'] = (None if not declared or not pinned else
                                    str(pinned).startswith(str(declared)) or str(declared).startswith(str(pinned)))
    out['citations'] = citations(nodes, edges, src, repo_root) if src else {'status': 'skipped', 'reason': 'no --source-repo'}
    out['coherence_pass'] = bool(out['schema_valid'] is not False and not ref['dangling_edges'])
    return out


def citations(nodes, edges, src, repo_root):
    c = Counter()
    fails = []

    def fail(where, path, problem, **kw):
        fails.append({'where': where, 'path': path, 'problem': problem, **kw})

    for n in nodes:
        for raw, lines in file_entries(n):
            p = norm_path(raw, repo_root)
            if '*' in p or p.endswith('/') or (p not in src.files and p.rstrip('/') in src.dirs):
                c['directory_entries'] += 1
                if not (any(fnmatch.fnmatchcase(f, p) for f in src.files) if '*' in p else p.rstrip('/') in src.dirs):
                    c['directory_entries_missing'] += 1
                    fail(f"node {n.get('id')}", p, 'directory or glob not found')
                continue
            c['file_citations'] += 1
            if p not in src.files:
                c['file_missing'] += 1
                fail(f"node {n.get('id')}", p, 'file not found')
                continue
            ok = True
            if lines is not None:
                c['line_ranges'] += 1
                ok = (isinstance(lines, list) and len(lines) == 2 and all(isinstance(v, int) for v in lines)
                      and 1 <= lines[0] <= lines[1] <= len(src.lines(p)))
                if not ok:
                    c['line_ranges_bad'] += 1
                    fail(f"node {n.get('id')}", p, f'lines {lines} outside 1..{len(src.lines(p))}', lines=lines)
            c['file_citations_ok'] += ok
    for i, e in enumerate(edges):
        for ev in as_list(e.get('evidence')):
            if not isinstance(ev, dict) or not isinstance(ev.get('file'), str):
                continue
            where, p, line = f"edge {e.get('id') or i}", norm_path(ev['file'], repo_root), ev.get('line')
            c['evidence_citations'] += 1
            if p not in src.files:
                c['evidence_missing_file'] += 1
                fail(where, p, 'file not found', line=line)
                continue
            if line is not None:
                text = src.lines(p)
                if not (isinstance(line, int) and 1 <= line <= len(text)):
                    c['evidence_bad_line'] += 1
                    fail(where, p, f'line past end of file ({len(text)} lines)', line=line)
                    continue
                if not text[line - 1].strip():
                    c['evidence_blank_line'] += 1
                    fail(where, p, 'line is blank', line=line)
                    continue
            c['evidence_ok'] += 1
    keys = ('file_citations', 'file_citations_ok', 'file_missing', 'line_ranges', 'line_ranges_bad', 'directory_entries',
            'directory_entries_missing', 'evidence_citations', 'evidence_ok', 'evidence_missing_file',
            'evidence_bad_line', 'evidence_blank_line')
    res = {'status': 'ok', **{k: c[k] for k in keys}}
    res['node_file_resolve_rate'] = ratio(c['file_citations'] - c['file_missing'], c['file_citations'])
    res['line_range_valid_rate'] = ratio(c['line_ranges'] - c['line_ranges_bad'], c['line_ranges'])
    res['evidence_resolve_rate'] = ratio(c['evidence_ok'], c['evidence_citations'])
    res['citation_resolve_rate'] = ratio(c['file_citations_ok'] + c['evidence_ok'], c['file_citations'] + c['evidence_citations'])
    res['failure_count'] = len(fails)
    res['failures'] = fails[:50]
    return res


# ---------------------------------------------------------------- one candidate

def score(path, raw, ctx):
    uni, ref_nodes, km = ctx['uni'], ctx['ref_nodes'], ctx['kinds']
    cand = prepare_graph(raw, uni, ctx['repo'])
    strict, tolerant, votes, outside = map_nodes(cand, uni, ref_nodes)
    S = {a: {r} for a, r in strict.items()}
    R, adj_false = ctx['R'], ctx['adj_false']
    ref_kind = {r: n.get('kind') for r, n in ref_nodes.items()}
    emap = km['edges']

    hit_t, hit_s = set().union(*tolerant.values()) if tolerant else set(), set(strict.values())
    in_scope = len(cand['nodes']) - len(outside)
    by_kind = {k: {'reference': sum(1 for r in ref_nodes if ref_kind[r] == k),
                   'recalled': sum(1 for r in ref_nodes if ref_kind[r] == k and r in hit_t)} for k in sorted(set(ref_kind.values()))}
    for v in by_kind.values():
        v['recall'] = ratio(v['recalled'], v['reference'])
    nmap = km['nodes']
    nk = [a for a in strict if strict[a] in ref_nodes]
    nodes = {'candidate': len(cand['nodes']), 'reference': len(ref_nodes), 'outside_reference_scope': len(outside),
             'recall': ratio(len(hit_t & set(ref_nodes)), len(ref_nodes)),
             'precision': ratio(sum(1 for a in tolerant if tolerant[a]), in_scope),
             'recall_strict': ratio(len(hit_s & set(ref_nodes)), len(ref_nodes)),
             'precision_strict': ratio(len(strict), in_scope), 'recall_by_kind': by_kind,
             'node_kind_agreement_strict': ratio(sum(1 for a in nk if nmap.get(cand['by_id'][a]['kind'], cand['by_id'][a]['kind'])
                                                     == nmap.get(ref_kind[strict[a]], ref_kind[strict[a]])), len(nk)),
             'path_expansion': cand['expansion']}

    et, rt, kt, pend_t = score_edges(cand, tolerant, R, adj_false, emap, ref_kind)
    es, rs, ks, pend_s = score_edges(cand, S, R, adj_false, emap, ref_kind)
    review = []
    for p in sorted(set(pend_t) | set(pend_s)):
        es_ = {e['id']: e for e in pend_t.get(p, []) + pend_s.get(p, [])}
        review.append({'pair': list(p), 'maps': [m for m, d in (('tolerant', pend_t), ('strict', pend_s)) if p in d],
                       'edges': [{k: e.get(k) for k in ('id', 'from', 'to', 'kind', 'label', 'evidence')} for e in es_.values()]})

    splits = defaultdict(list)
    for a, r in strict.items():
        splits[r].append(a)
    gran = {'merges': [{'node': a, 'refs': sorted(t)} for a, t in tolerant.items() if len(t) > 1],
            'splits': [{'ref': r, 'candidate_nodes': sorted(v)} for r, v in sorted(splits.items()) if len(v) > 1],
            'unmapped': {a: votes[a] for a in tolerant if not tolerant[a] and a not in outside},
            'strict_unmapped': {a: votes[a] for a in tolerant if a not in strict and a not in outside},
            'outside_reference_scope': outside,
            'tolerant_map': {a: sorted(t) for a, t in tolerant.items()}, 'strict_map': strict}

    listed_by = defaultdict(list)
    for n in cand['nodes']:
        for p in n['paths']:
            listed_by[p].append(n['id'])
    labels = ctx['ref_labels']
    bc = raw.get('x-build-cost') if isinstance(raw, dict) else None
    return {
        'candidate': str(path),
        'inputs': {**ctx['inputs'], 'candidate': {'path': str(path), 'sha256': sha256(path)}},
        'nodes': nodes,
        'edges': {'tolerant': et, 'strict': es},
        'route_and_api_edges': {'tolerant': rt, 'strict': rs},
        'edge_kind_agreement': {'tolerant': kt, 'strict': ks, 'kind_mapping_source': km['source']},
        'file_grouping': file_grouping(cand, uni),
        'questions': score_questions(ctx['questions'], tolerant, cand) if ctx['questions'] else
        {'status': 'skipped', 'reason': 'no --questions'},
        'localization': localization(ctx['tasks'], listed_by, ctx['src'], uni) if ctx['tasks'] is not None and ctx['src']
        else {'status': 'skipped', 'reason': 'needs --tasks and --source-repo'},
        'coherence': coherence(raw, cand, ctx['schema'], ctx['src'], ctx['pinned'], ctx['repo']),
        'build_cost': bc if isinstance(bc, dict) else None,
        'needs_human_review': review,
        'missed_reference_pairs': [{'pair': p, 'reference_edges': labels[tuple(p)]} for p in et['missed_pairs']],
        'granularity': gran,
    }


def reference_baseline(ctx):
    """The reference ownership scored as a graph: each node lists the files it owns, and each shared file is
    listed under every member node. A baseline, not an upper bound: candidates may list files the reference
    does not own and score above it."""
    if ctx['tasks'] is None or not ctx['src']:
        return None
    uni = ctx['uni']
    listed = {p: [uni.node_owner(p)] for p in uni.paths if uni.node_owner(p)}
    listed.update({p: m for p, m in uni.members.items() if m})
    return localization(ctx['tasks'], listed, ctx['src'], ctx['uni'])


# ---------------------------------------------------------------- reports

def fmt(x):
    return 'n/a' if x is None else (f'{x:.3f}' if isinstance(x, float) else str(x))


def get(d, *keys):
    for k in keys:
        if not isinstance(d, dict):
            return None
        d = d.get(k)
    return d


def cell(res, keys):
    d = res
    for k in keys:
        if isinstance(d, dict) and d.get('status') == 'skipped':
            return 'skipped'
        d = d.get(k) if isinstance(d, dict) else None
    return fmt(d)


def cost_total(bc):
    if not isinstance(bc, dict):
        return None
    if isinstance(bc.get('usd'), (int, float)):
        return f"${bc['usd']}"
    toks = [bc.get(k) for k in ('tokens_in', 'tokens_out', 'tokens') if isinstance(bc.get(k), (int, float))]
    return f'{sum(toks)} tokens' if toks else 'given'


BASELINE_KEYS = ('file_recall_macro', 'in_scope_recall_macro', 'hit_rate', 'precision_macro', 'f2_macro')

ROWS = [
    ('Node recall', ('nodes', 'recall')), ('Node precision', ('nodes', 'precision')),
    ('Edge P (decided), tolerant', ('edges', 'tolerant', 'precision_decided')),
    ('Edge R, tolerant', ('edges', 'tolerant', 'recall')), ('Edge F1, tolerant', ('edges', 'tolerant', 'f1')),
    ('Edge P (decided), strict', ('edges', 'strict', 'precision_decided')),
    ('Edge R, strict', ('edges', 'strict', 'recall')), ('Edge F1, strict', ('edges', 'strict', 'f1')),
    ('Pending review pairs (tolerant)', ('edges', 'tolerant', 'pending')),
    ('Route/API edge F1, tolerant', ('route_and_api_edges', 'tolerant', 'f1')),
    ('Edge kind agreement, tolerant', ('edge_kind_agreement', 'tolerant', 'agreement')),
    ('File grouping F1', ('file_grouping', 'f1')), ('File coverage', ('file_grouping', 'coverage')),
    ('Questions: has', ('questions', 'headline', 'has', 'accuracy')),
    ('Questions: does-not-have', ('questions', 'headline', 'does_not_have', 'accuracy')),
    ('Questions: scope', ('questions', 'headline', 'scope', 'accuracy')),
    ('Localization file recall', ('localization', 'file_recall_macro')),
    ('Localization file recall / reference', ('localization', 'file_recall_macro_vs_reference')),
    ('Localization hit rate', ('localization', 'hit_rate')),
    ('Localization hit rate / reference', ('localization', 'hit_rate_vs_reference')),
    ('Localization precision', ('localization', 'precision_macro')),
    ('Localization F2 (headline)', ('localization', 'f2_macro')),
    ('Coherence pass', ('coherence', 'coherence_pass')),
    ('Citation resolve rate', ('coherence', 'citations', 'citation_resolve_rate')),
]


def top(items, n=8):
    lines = items[:n]
    return lines + ([f'- ({len(items) - n} more in JSON)'] if len(items) > n else [])


def summary(name, res, ctx):
    q = res['questions']
    prov = ' (questions PROVISIONAL)' if q.get('provisional') else ''
    c = res['coherence']
    lines = [f'# Q1 score: {name}{prov}', '',
             f"Candidate `{res['candidate']}` vs reference `{ctx['inputs']['reference']['path']}` at commit "
             f"`{ctx['pinned']}`" + ('' if c['commit_matches_pinned'] is not False else f" (candidate declares `{c['declared_commit']}`)"),
             '', '| Metric | Value |', '|---|---|']
    for label, keys in ROWS:
        lines.append(f'| {label} | {cell(res, keys)} |')
    lines.append(f"| Build cost | {cost_total(res['build_cost']) or 'n/a'} |")
    base = get(res, 'localization', 'reference_baseline')
    if base:
        lines += ['', f"Localization, reference ownership as a graph (a baseline, not an upper bound): file recall "
                  f"{fmt(base.get('file_recall_macro'))}, hit rate {fmt(base.get('hit_rate'))}, precision "
                  f"{fmt(base.get('precision_macro'))}, F2 {fmt(base.get('f2_macro'))}."]
    ns = get(res, 'localization', 'files_excluded_not_source')
    if ns:
        lines.append(f"{ns} changed files are not production code (tests, mocks, test utilities, non-code) and are not targets.")
    e = res['edges']['tolerant']
    lines += ['', f"Edges: {e['tp_edges']} TP, {e['confirmed_fp_edges']} confirmed FP, {e['pending_edges']} pending, "
              f"{e['unmapped_edges']} unmapped, {e['collapsed_edges']} collapsed (tolerant). "
              f"Precision bounds {fmt(e['precision_lower'])}..{fmt(e['precision_upper'])}."]
    g = res['granularity']
    lines.append(f"Granularity: {len(g['merges'])} merges, {len(g['splits'])} splits, {len(g['unmapped'])} unmapped, "
                 f"{len(g['outside_reference_scope'])} outside reference scope.")
    sections = [
        ('Needs human review', [f"- {r['pair'][0]} -> {r['pair'][1]} (edges {', '.join(x['id'] for x in r['edges'])})"
                                for r in res['needs_human_review']]),
        ('Missed reference pairs', [f"- {m['pair'][0]} -> {m['pair'][1]}: "
                                    + '; '.join(str(x['label'] or x['kind']) for x in m['reference_edges'])
                                    for m in res['missed_reference_pairs']]),
        ('Incorrect questions', [f"- {x['id']} [{x['polarity']}/{x['category']}] {x['text']}" for x in q.get('incorrect', [])]),
        ('Coherence failures', [f'- {k}: {v}' for k in ('dangling_edges', 'duplicate_node_ids', 'duplicate_edge_ids',
                                                        'self_loop_edges', 'unknown_group', 'unknown_group_parent',
                                                        'nodes_without_files') for v in c[k]]
         + [f'- schema: {s}' for s in (c['schema_errors'] if isinstance(c['schema_errors'], list) else [])]
         + [f"- citation {f['where']}: {f['path']} {f['problem']}" for f in get(c, 'citations', 'failures') or []]),
    ]
    for title, items in sections:
        if items:
            lines += ['', f'## {title} ({len(items)})', *top(items)]
    return '\n'.join(lines) + '\n'


def order_key(item):
    name, res = item
    f = get(res, 'edges', 'tolerant', 'f1')
    bc = res['build_cost'] or {}
    usd = bc.get('usd') if isinstance(bc.get('usd'), (int, float)) else None
    toks = [bc.get(k) for k in ('tokens_in', 'tokens_out', 'tokens') if isinstance(bc.get(k), (int, float))]
    cost = (0, usd) if usd is not None else (1, sum(toks)) if toks else (2, 0)
    return (-round(f, 3) if f is not None else 1, cost, name)


def comparison(results, baseline):
    ordered = sorted(results.items(), key=order_key)
    names = [n for n, _ in ordered]
    rows = {label: {n: get(r, *keys) for n, r in ordered} for label, keys in ROWS}
    cells = {label: {n: cell(r, keys) for n, r in ordered} for label, keys in ROWS}
    rows['Build cost'] = cells['Build cost'] = {n: cost_total(r['build_cost']) for n, r in ordered}
    ceil = {label: get(baseline, k) for label, k in (('Localization file recall', 'file_recall_macro'),
            ('Localization hit rate', 'hit_rate'), ('Localization precision', 'precision_macro'), ('Localization F2 (headline)', 'f2_macro'))}
    md = ['# Q1 comparison', '', '| Metric | ' + ' | '.join(names) + ' | reference (ownership) |',
          '|---|' + '---|' * (len(names) + 1)]
    for label, vals in rows.items():
        md.append(f'| {label} | ' + ' | '.join(str(cells[label][n] or 'n/a') for n in names) + f" | {fmt(ceil[label]) if label in ceil else ''} |")
    md += ['', 'Columns are ordered by tolerant edge F1, descending. When two candidates are equal to 3 decimals, the '
           'cheaper build (x-build-cost usd, else total tokens; candidates without a cost last) comes first.', '']
    return {'order': names, 'rows': rows, 'reference_baseline': ceil}, '\n'.join(md)


# ---------------------------------------------------------------- main

def build_context(a):
    ref = load(a.reference)
    if not isinstance(ref, dict) or not isinstance(ref.get('nodes'), list):
        raise InputError(f'{a.reference}: not a graph with a nodes list')
    ownership = load(a.ownership)
    if not isinstance(ownership, dict) or 'files' not in ownership:
        raise InputError(f'{a.ownership}: no files mapping')
    adj = ((load(a.adjudications) or {}).get('pairs') or []) if a.adjudications else []
    adj = [x for x in adj if isinstance(x, dict) and x.get('from') and x.get('to')]
    inputs = {'reference': a.reference, 'ownership': a.ownership, 'adjudications': a.adjudications,
              'questions': a.questions, 'tasks': a.tasks, 'schema': a.schema}
    inputs = {k: ({'path': v, 'sha256': sha256(v)} if v else None) for k, v in inputs.items()}
    commit = a.commit or ref.get('commit')
    src = None
    if a.source_repo:
        if not commit:
            raise InputError('no --commit and the reference has no commit')
        commit = git(a.source_repo, 'rev-parse', '--verify', f'{commit}^{{commit}}').strip()
        src = Source(a.source_repo, commit)
    kinds = kind_mapping(ref)
    R, labels = reference_pairs(ref, kinds['edges'], {(x['from'], x['to']) for x in adj if x.get('verdict') is True})
    tasks = load(a.tasks) if a.tasks else None
    if tasks is not None and not isinstance(tasks, list):
        raise InputError(f'{a.tasks}: expected a list of tasks')
    inputs['pinned_commit'] = commit
    inputs['source_repo'] = a.source_repo
    return {'ref': ref, 'ref_nodes': {n['id']: n for n in ref['nodes']}, 'uni': Universe(ownership, src.files if src else ()),
            'kinds': kinds,
            'R': R, 'ref_labels': labels, 'adj_false': {(x['from'], x['to']) for x in adj if x.get('verdict') is False},
            'questions': load(a.questions) if a.questions else None, 'tasks': tasks, 'src': src, 'pinned': commit,
            'repo': a.source_repo, 'schema': load(a.schema) if a.schema and Path(a.schema).exists() else None,
            'inputs': inputs}


def unique_names(cands, names):
    out, used = [], Counter()
    for c, n in zip(cands, names or [Path(c).stem for c in cands]):
        used[n] += 1
        out.append(n if used[n] == 1 else f'{n}-{used[n]}')
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('candidates', nargs='+', metavar='CANDIDATE')
    ap.add_argument('--reference', required=True)
    ap.add_argument('--ownership', required=True)
    ap.add_argument('--adjudications')
    ap.add_argument('--questions')
    ap.add_argument('--tasks')
    ap.add_argument('--source-repo')
    ap.add_argument('--commit')
    ap.add_argument('--schema', default=str(REPO / 'schema' / 'graph.schema.json'))
    ap.add_argument('--out-dir', default=str(REPO / 'scoring' / 'out'))
    ap.add_argument('--name', action='extend', nargs='+', help='one name per candidate (repeatable)')
    a = ap.parse_args(argv)
    if a.name and len(a.name) != len(a.candidates):
        ap.error(f'{len(a.name)} --name values for {len(a.candidates)} candidates')
    try:
        ctx = build_context(a)
        results = {}
        for name, path in zip(unique_names(a.candidates, a.name), a.candidates):
            results[name] = score(path, load(path), ctx)
    except InputError as ex:
        print(f'error: {ex}', file=sys.stderr)
        return 2
    out = Path(a.out_dir)
    if leaks_into_repo(out, a.reference):
        print(f'warning: {out} is inside the team repo but the reference is not; these scores are answer-key '
              'material that agents working in the repo can read. Prefer an --out-dir outside the repo.', file=sys.stderr)
    out.mkdir(parents=True, exist_ok=True)
    baseline = reference_baseline(ctx)
    for res in results.values():
        loc = res.get('localization')
        if isinstance(loc, dict) and baseline:
            loc['reference_baseline'] = {k: baseline.get(k) for k in BASELINE_KEYS}
            for k in ('file_recall_macro', 'hit_rate'):
                loc[k + '_vs_reference'] = ratio(loc[k], baseline[k]) if loc[k] is not None and baseline[k] is not None else None
    for name, res in results.items():
        (out / f'{name}.score.json').write_text(json.dumps(res, indent=1, allow_nan=False, default=str) + '\n')
        md = summary(name, res, ctx)
        (out / f'{name}.summary.md').write_text(md)
        print(md)
    if len(results) > 1:
        cj, cm = comparison(results, baseline)
        (out / 'comparison.json').write_text(json.dumps(cj, indent=1, allow_nan=False) + '\n')
        (out / 'comparison.md').write_text(cm)
        print(cm)
    return 0


if __name__ == '__main__':
    sys.exit(main())
