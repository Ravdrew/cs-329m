"""Tests for scoring/score_graph.py and scoring/make_questions.py on a synthetic pet clinic app (fixtures/)."""
import copy
import json
import subprocess
import sys
from pathlib import Path

import pytest
import yaml

HERE = Path(__file__).resolve().parent
FIX = HERE / 'fixtures'
SCORING = HERE.parent
sys.path.insert(0, str(SCORING))

import make_questions  # noqa: E402
import score_graph  # noqa: E402

SCHEMA = SCORING.parent / 'schema' / 'graph.schema.json'
PRISMA = 'model Appointment {\n  id    Int @id\n  petId Int\n  at    DateTime\n  vet   String\n}\n\nmodel Pet {\n  id   Int @id\n  name String\n  kind String\n}\n'


@pytest.fixture
def env(tmp_path):
    """Tiny git repo holding every ownership file, plus the reference pinned to its commit."""
    repo = tmp_path / 'src'
    for p in json.loads((FIX / 'ownership.json').read_text())['files']:
        f = repo / p
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text(PRISMA if p.endswith('.prisma') else f'// {p}\nexport const x = 1;\n\nexport function f() {{ return x; }}\n// end\n')
    git = lambda *a: subprocess.run(['git', '-C', str(repo), '-c', 'user.name=t', '-c', 'user.email=t@example.com',
                                     '-c', 'commit.gpgsign=false', *a], check=True, capture_output=True, text=True).stdout
    git('init', '-q')
    git('add', '-A')
    git('commit', '-qm', 'fixture')
    sha = git('rev-parse', 'HEAD').strip()
    ref = yaml.safe_load((FIX / 'reference.yaml').read_text())
    ref['commit'] = sha
    ref_path = tmp_path / 'reference.yaml'
    ref_path.write_text(yaml.safe_dump(ref, sort_keys=False))
    return {'tmp': tmp_path, 'repo': repo, 'sha': sha, 'ref': ref, 'ref_path': ref_path}


def write(env, name, graph):
    p = env['tmp'] / name
    p.write_text(json.dumps(graph) if name.endswith('.json') else yaml.safe_dump(graph, sort_keys=False))
    return p


def run(env, *cands, adjudications=False, source=True, questions=None, tasks=False, names=None, ref=None, out='out'):
    argv = ['--reference', str(ref or env['ref_path']), '--ownership', str(FIX / 'ownership.json'),
            '--schema', str(SCHEMA), '--out-dir', str(env['tmp'] / out)]
    argv += ['--adjudications', str(FIX / 'adjudications.yaml')] if adjudications else []
    argv += ['--source-repo', str(env['repo'])] if source else []
    argv += ['--questions', str(questions)] if questions else []
    argv += ['--tasks', str(FIX / 'tasks.json')] if tasks else []
    argv += [str(c) for c in cands] + (['--name', *names] if names else [])
    assert score_graph.main(argv) == 0
    names = names or score_graph.unique_names([str(c) for c in cands], None)
    return [json.loads((env['tmp'] / out / f'{n}.score.json').read_text()) for n in names]


def graph(env):
    g = copy.deepcopy(env['ref'])
    g.pop('x-scoring', None)
    return g


def edges(res, m='tolerant'):
    return res['edges'][m]


def test_self_score_is_perfect(env):
    r, = run(env, write(env, 'self.yaml', graph(env)))
    assert r['nodes']['recall'] == r['nodes']['precision'] == 1.0
    for m in ('tolerant', 'strict'):
        e = edges(r, m)
        assert e['precision_decided'] == e['recall'] == e['f1'] == e['precision_lower'] == 1.0
        assert e['pending'] == 0 and e['reference_pairs'] == 10
        assert r['route_and_api_edges'][m]['f1'] == 1.0
    assert r['edge_kind_agreement']['tolerant']['agreement'] == 1.0
    fg = r['file_grouping']
    assert fg['precision'] == fg['recall'] == fg['f1'] == 1.0
    assert r['needs_human_review'] == [] and r['missed_reference_pairs'] == []
    c = r['coherence']
    assert c['coherence_pass'] and c['schema_valid'] and c['commit_matches_pinned']
    assert c['citations']['citation_resolve_rate'] == 1.0 and c['citations']['failure_count'] == 0
    assert r['granularity']['merges'] == [] and r['granularity']['splits'] == []


def test_renamed_ids_and_labels_score_the_same(env):
    g = graph(env)
    ren = {n['id']: f'n{i}' for i, n in enumerate(g['nodes'])}
    for n in g['nodes']:
        n['id'], n['label'] = ren[n['id']], 'Thing'
    for e in g['edges']:
        e['from'], e['to'] = ren[e['from']], ren[e['to']]
    base, renamed = run(env, write(env, 'self.yaml', graph(env)), write(env, 'renamed.json', g))
    for k in ('edges', 'route_and_api_edges', 'file_grouping', 'edge_kind_agreement'):
        assert renamed[k] == base[k]
    assert renamed['nodes']['recall'] == 1.0


def test_dropped_edges_lower_recall_only(env):
    g = graph(env)
    g['edges'] = [e for e in g['edges'] if e['id'] not in ('e01', 'e05', 'e11')]  # e11 is a parallel edge
    r, = run(env, write(env, 'dropped.yaml', g))
    for m in ('tolerant', 'strict'):
        assert edges(r, m)['recall'] == pytest.approx(8 / 10)
        assert edges(r, m)['precision_decided'] == 1.0
    assert sorted(p['pair'] for p in r['missed_reference_pairs']) == [
        ['page.home', 'page.book-visit'], ['service.scheduling', 'model.appointment']]


def merged(env):
    g = graph(env)
    sched = next(n for n in g['nodes'] if n['id'] == 'service.scheduling')
    bill = next(n for n in g['nodes'] if n['id'] == 'service.billing')
    sched['id'], sched['label'] = 'service.core', 'Core services'
    sched['files'] += ['lib/scheduling/tz.ts'] + bill['files']
    g['nodes'].remove(bill)
    for e in g['edges']:
        for end in ('from', 'to'):
            if e[end] in ('service.scheduling', 'service.billing'):
                e[end] = 'service.core'
    return g


def test_merged_nodes(env):
    r, = run(env, write(env, 'merged.yaml', merged(env)))
    t, s = edges(r, 'tolerant'), edges(r, 'strict')
    assert s['recall'] < t['recall'] == 1.0
    assert t['precision_decided'] == 1.0
    assert r['file_grouping']['precision'] < 1.0 and r['file_grouping']['recall'] == 1.0
    assert r['granularity']['merges'] == [{'node': 'service.core', 'refs': ['service.billing', 'service.scheduling']}]
    assert r['granularity']['strict_map']['service.core'] == 'service.scheduling'
    assert r['nodes']['recall'] == 1.0 and r['nodes']['recall_strict'] < 1.0


def test_split_node(env):
    g = graph(env)
    sched = next(n for n in g['nodes'] if n['id'] == 'service.scheduling')
    g['nodes'].remove(sched)
    g['nodes'] += [{'id': 'sched-a', 'label': 'Slots', 'kind': 'service', 'files': ['lib/scheduling/slots.ts']},
                   {'id': 'sched-b', 'label': 'Rules', 'kind': 'service', 'files': ['lib/scheduling/rules.ts']}]
    for e in g['edges']:
        if e['from'] == 'service.scheduling':
            e['from'] = 'sched-b' if e['to'] == 'model.pet' else 'sched-a'
        if e['to'] == 'service.scheduling':
            e['to'] = 'sched-a'
    base, r = run(env, write(env, 'self.yaml', graph(env)), write(env, 'split.yaml', g))
    assert r['file_grouping']['recall'] < 1.0 and r['file_grouping']['precision'] == 1.0
    assert edges(r)['recall'] == edges(base)['recall'] == 1.0
    assert r['granularity']['splits'] == [{'ref': 'service.scheduling', 'candidate_nodes': ['sched-a', 'sched-b']}]


def test_adjudications_and_human_review(env):
    g = graph(env)
    g['edges'].append({'id': 'x1', 'from': 'service.scheduling', 'to': 'service.billing', 'kind': 'calls'})  # adjudicated true
    g['edges'].append({'id': 'x2', 'from': 'page.book-visit', 'to': 'service.billing', 'kind': 'calls', 'label': 'new?'})
    r, = run(env, write(env, 'extra.yaml', g), adjudications=True)
    t = edges(r)
    assert t['reference_pairs'] == 11 and t['recall'] == 1.0 and t['tp'] == 11
    assert t['precision_decided'] == 1.0 and t['pending'] == 1 and t['confirmed_fp'] == 0
    assert t['precision_lower'] == pytest.approx(11 / 12) and t['precision_upper'] == 1.0
    review, = r['needs_human_review']
    assert review['pair'] == ['page.book-visit', 'service.billing'] and review['edges'][0]['id'] == 'x2'
    assert review['edges'][0]['label'] == 'new?' and review['maps'] == ['tolerant', 'strict']

    g['edges'].append({'id': 'x3', 'from': 'page.home', 'to': 'model.pet', 'kind': 'reads'})  # adjudicated false
    r, = run(env, write(env, 'extra.yaml', g), adjudications=True)
    t = edges(r)
    assert t['confirmed_fp'] == 1 and t['pending'] == 1
    assert t['precision_decided'] == pytest.approx(11 / 12)
    assert t['precision_lower'] == pytest.approx(11 / 13) and t['precision_upper'] == pytest.approx(12 / 13)

    plain, = run(env, write(env, 'self.yaml', graph(env)), adjudications=True)
    assert edges(plain)['recall'] == pytest.approx(10 / 11)


def test_coherence_flags_do_not_crash(env, capsys):
    g = graph(env)
    g['nodes'].append(copy.deepcopy(g['nodes'][0]))
    g['nodes'][1]['kind'] = 'widget'
    g['nodes'][2]['group'] = 'nowhere'
    g['groups'].append({'id': 'orphan', 'label': 'Orphan', 'parent': 'missing'})
    g['nodes'].append({'id': 'empty', 'label': 'Empty', 'kind': 'other', 'files': []})
    g['edges'] += [{'id': 'e01', 'from': 'page.home', 'to': 'ghost', 'kind': 'calls'},
                   {'from': 'page.home', 'to': 'page.home', 'kind': 'navigates'}]
    r, = run(env, write(env, 'broken.yaml', g))
    c = r['coherence']
    assert c['schema_valid'] is False and c['schema_error_count'] >= 1 and not c['coherence_pass']
    assert c['dangling_edges'] == ['e01: page.home->ghost']
    assert c['duplicate_node_ids'] == ['page.home'] and c['duplicate_edge_ids'] == ['e01']
    assert c['unknown_group'] == ['api.appointments: nowhere'] and c['unknown_group_parent'] == ['orphan: missing']
    assert len(c['self_loop_edges']) == 1 and c['nodes_without_files'] == ['empty']
    assert 'Coherence failures' in capsys.readouterr().out


def test_broken_citations_are_counted(env):
    g = graph(env)
    g['nodes'][0]['files'] += ['lib/missing.ts', {'path': 'jobs/reminders.ts', 'lines': [2, 99]}]
    g['edges'][0]['evidence'] = [{'file': 'web/pages/home.tsx', 'line': 3},   # blank line
                                 {'file': 'web/pages/home.tsx', 'line': 40},  # past EOF
                                 {'file': 'web/pages/gone.tsx', 'line': 1}]
    r, = run(env, write(env, 'cites.yaml', g))
    c = r['coherence']['citations']
    assert (c['file_missing'], c['line_ranges_bad'], c['evidence_blank_line'], c['evidence_bad_line'],
            c['evidence_missing_file']) == (1, 1, 1, 1, 1)
    assert c['failure_count'] == 5 and c['citation_resolve_rate'] < 1.0

    off, = run(env, write(env, 'cites.yaml', g), source=False, out='nosrc')
    assert off['coherence']['citations']['status'] == 'skipped' and off['localization']['status'] == 'skipped'


def test_directory_glob_and_path_normalisation(env):
    g = graph(env)
    nodes = {n['id']: n for n in g['nodes']}
    nodes['service.scheduling']['files'] = ['lib/scheduling/']
    nodes['service.billing']['files'] = ['./lib\\billing\\invoice.ts', str(env['repo'] / 'lib/billing/charge.ts')]
    nodes['page.book-visit']['files'] = ['web/pages/book*.tsx']
    nodes['api.appointments']['files'] = ['/api/appointments']
    r, = run(env, write(env, 'dirs.yaml', g))
    assert r['nodes']['path_expansion'] == {'entries_expanded': 3, 'paths_added': 7}
    assert r['granularity']['strict_map']['service.scheduling'] == 'service.scheduling'
    assert r['granularity']['strict_map']['service.billing'] == 'service.billing'
    fg = r['file_grouping']  # the directory entry also brings in lib/scheduling/tz.ts
    assert fg['files_compared'] == fg['reference_files'] == 13 and fg['f1'] == 1.0
    assert edges(r)['recall'] == 1.0
    c = r['coherence']['citations']
    assert c['directory_entries'] == 3 and c['directory_entries_missing'] == 0 and c['file_missing'] == 0


def test_questions_and_generator(env, tmp_path):
    out1, out2 = tmp_path / 'q1.json', tmp_path / 'q2.json'
    args = ['--reference', str(env['ref_path']), '--ownership', str(FIX / 'ownership.json'), '--adjudications',
            str(FIX / 'adjudications.yaml'), '--extra', str(FIX / 'questions-extra.yaml'), '--date', '2026-01-01']
    assert make_questions.main(args + ['--out', str(out1)]) == 0
    assert make_questions.main(args + ['--out', str(out2)]) == 0
    assert out1.read_bytes() == out2.read_bytes()
    q = json.loads(out1.read_text())
    assert q['status'] == 'PROVISIONAL'
    assert [x['id'] for x in q['questions']] == [f'q{i:03d}' for i in range(1, len(q['questions']) + 1)]
    kinds = [(x['polarity'], x['category']) for x in q['questions']]
    assert kinds.count(('has', 'node')) == 9 and kinds.count(('has', 'edge')) == 11
    assert kinds.count(('does_not_have', 'scope')) == 2 and kinds[-1] == ('has', 'documented')
    assert q['questions'][-1]['weight'] == 2
    rev = [x for x in q['questions'] if x['source'] == 'reversal (closed world)']
    assert {(x['check']['from'], x['check']['to']) for x in rev} == {
        ('page.book-visit', 'page.home'), ('api.appointments', 'page.book-visit'), ('service.scheduling', 'api.appointments'),
        ('service.billing', 'api.appointments'), ('job.reminders', 'service.billing'),
        ('service.billing', 'service.scheduling')}
    assert any(x['source'] == 'adjudication (false)' for x in q['questions'])
    blocked = SCORING / 'out' / 'must-not-exist.json'
    assert make_questions.main(args + ['--out', str(blocked)]) == 2 and not blocked.exists()

    g = graph(env)
    g['edges'].append({'id': 'x1', 'from': 'service.scheduling', 'to': 'service.billing', 'kind': 'calls'})
    good, = run(env, write(env, 'good.yaml', g), adjudications=True, questions=out1)
    assert good['questions']['overall']['accuracy'] == 1.0 and good['questions']['provisional']
    for k in ('has', 'does_not_have', 'scope'):
        assert good['questions']['headline'][k]['accuracy'] == 1.0

    g['nodes'] = [n for n in g['nodes'] if n['id'] != 'job.reminders']
    g['nodes'].append({'id': 'admin', 'label': 'Admin', 'kind': 'page', 'files': ['admin/reports.ts', 'admin/export.ts']})
    g['edges'] = [e for e in g['edges'] if 'job.reminders' not in (e['from'], e['to'])]
    g['edges'].append({'id': 'x9', 'from': 'page.book-visit', 'to': 'page.home', 'kind': 'navigates'})
    bad, = run(env, write(env, 'bad.yaml', g), adjudications=True, questions=out1)
    wrong = {(x['polarity'], x['category']) for x in bad['questions']['incorrect']}
    assert wrong == {('has', 'node'), ('has', 'edge'), ('does_not_have', 'edge'), ('does_not_have', 'scope')}
    assert bad['questions']['headline']['scope']['accuracy'] == 0.5
    assert 'PROVISIONAL' in (env['tmp'] / 'out' / 'bad.summary.md').read_text().splitlines()[0]


def test_localization(env):
    g = graph(env)
    r, = run(env, write(env, 'self.yaml', g), tasks=True)
    loc = r['localization']
    assert loc['files_excluded_absent_at_commit'] == 1 and loc['excluded'][0]['path'] == 'lib/billing/refund.ts'
    t1, t2, t3 = loc['per_task']
    assert (t1['eligible_files'], t1['in_scope_files'], t1['file_recall'], t1['in_scope_recall']) == (3, 2, 1 / 3, 0.5)
    assert t1['nodes_pointed'] == ['service.scheduling'] and t2['file_recall'] == 1.0 and not t3['hit']
    assert loc['file_recall_macro'] == pytest.approx(4 / 9) and loc['hit_rate'] == pytest.approx(2 / 3)
    assert loc['in_scope_recall_macro'] == pytest.approx(0.75)

    g2 = copy.deepcopy(g)
    g2['x-build-cost'] = {'usd': 1}
    run(env, write(env, 'self.yaml', g), write(env, 'other.yaml', g2), tasks=True)
    ceiling = json.loads((env['tmp'] / 'out' / 'comparison.json').read_text())['reference_ceiling']
    assert ceiling['Localization file recall'] == pytest.approx(5 / 9)
    assert ceiling['Localization hit rate'] == pytest.approx(2 / 3)
    assert score_graph.strip_status('R100:old/a.ts\tnew/b.ts') == 'new/b.ts'
    assert score_graph.strip_status('D:gone.ts') == 'gone.ts'


def test_comparison_order_and_cost_tiebreak(env):
    g = graph(env)
    dear, cheap, worse = copy.deepcopy(g), copy.deepcopy(g), copy.deepcopy(g)
    dear['x-build-cost'] = {'model': 'big', 'usd': 5.0}
    cheap['x-build-cost'] = {'model': 'small', 'usd': 2.0}
    worse['x-build-cost'] = {'usd': 0.1}
    worse['edges'] = worse['edges'][:3]
    run(env, write(env, 'dear.yaml', dear), write(env, 'worse.yaml', worse), write(env, 'cheap.yaml', cheap),
        names=['dear', 'worse', 'cheap'])
    comp = json.loads((env['tmp'] / 'out' / 'comparison.json').read_text())
    assert comp['order'] == ['cheap', 'dear', 'worse']
    md = (env['tmp'] / 'out' / 'comparison.md').read_text()
    assert '| Metric | cheap | dear | worse | reference ceiling |' in md and 'cheaper build' in md
    r = json.loads((env['tmp'] / 'out' / 'cheap.score.json').read_text())
    assert r['build_cost'] == {'model': 'small', 'usd': 2.0}
    assert score_graph.unique_names(['x/self.yaml', 'y/self.json'], None) == ['self', 'self-2']


def test_cli_end_to_end_without_optional_inputs(env):
    cand = write(env, 'self.yaml', graph(env))
    out = env['tmp'] / 'cli'
    cmd = [sys.executable, str(SCORING / 'score_graph.py'), '--reference', str(env['ref_path']),
           '--ownership', str(FIX / 'ownership.json'), '--out-dir', str(out), str(cand)]
    p = subprocess.run(cmd, capture_output=True, text=True)
    assert p.returncode == 0, p.stderr
    assert '# Q1 score: self' in p.stdout
    r = json.loads((out / 'self.score.json').read_text())
    assert r['questions']['status'] == r['localization']['status'] == r['coherence']['citations']['status'] == 'skipped'
    assert r['coherence']['schema_valid'] is True  # default --schema found relative to the script
    assert r['inputs']['candidate']['sha256'] and r['inputs']['adjudications'] is None
    assert (out / 'self.summary.md').exists() and not (out / 'comparison.md').exists()
    assert 'NaN' not in (out / 'self.score.json').read_text()
    assert subprocess.run(cmd[:2] + [str(cand)], capture_output=True).returncode == 2
    assert subprocess.run(cmd[:-1] + [str(env['tmp'] / 'missing.yaml')], capture_output=True).returncode == 2


def test_default_kind_mapping_without_x_scoring(env):
    ref = copy.deepcopy(env['ref'])
    ref.pop('x-scoring')
    bare = write(env, 'bare-ref.yaml', ref)
    g = graph(env)
    for e in g['edges']:
        if e['kind'] == 'emits':
            e['kind'] = 'uses'
    r, = run(env, write(env, 'cand.yaml', g), ref=bare)
    assert r['edge_kind_agreement']['kind_mapping_source'] == 'default'
    assert r['edge_kind_agreement']['tolerant']['agreement'] == 1.0
    ref['x-scoring'] = {'kind_mapping': {'edges': {'emits': 'emits', 'uses': 'uses'}}}
    r, = run(env, write(env, 'cand.yaml', g), ref=write(env, 'strict-ref.yaml', ref))
    assert r['edge_kind_agreement']['kind_mapping_source'] == 'x-scoring'
    assert r['edge_kind_agreement']['tolerant']['agreement'] == pytest.approx(9 / 10)


def test_model_names_tokens_and_wide_line_ranges(env):
    g = graph(env)
    m = {n['id']: n for n in g['nodes']}
    m['model.pet'].update(id='owner-pet-model', label='Owner & Pet')                 # token run -> Pet
    m['model.appointment'].update(id='records', label='Clinic records',              # no name: lines decide
                                  files=[{'path': 'db/schema.prisma', 'lines': [1, 12]}])
    for e in g['edges']:
        e['from'], e['to'] = ({'model.pet': 'owner-pet-model', 'model.appointment': 'records'}.get(x, x)
                              for x in (e['from'], e['to']))
    r, = run(env, write(env, 'names.yaml', g))
    tol, strict = r['granularity']['tolerant_map'], r['granularity']['strict_map']
    assert strict['owner-pet-model'] == 'model.pet' and tol['owner-pet-model'] == ['model.pet']
    # lines 1-12 fully cover both models: tolerant gets both, strict the one with the larger overlap
    assert sorted(tol['records']) == ['model.appointment', 'model.pet']
    assert strict['records'] == 'model.appointment'


def test_localization_follows_renames_since_the_merge_commit(env):
    git = lambda *a: subprocess.run(['git', '-C', str(env['repo']), '-c', 'user.name=t', '-c', 'user.email=t@example.com',
                                     '-c', 'commit.gpgsign=false', *a], check=True, capture_output=True, text=True).stdout.strip()
    git('mv', 'lib/billing/charge.ts', 'lib/billing/old-charge.ts')
    git('commit', '-qm', 'old layout')
    merge = git('rev-parse', 'HEAD')
    git('mv', 'lib/billing/old-charge.ts', 'lib/billing/charge.ts')
    git('commit', '-qm', 'moved back')
    ref = copy.deepcopy(env['ref'])
    ref['commit'] = git('rev-parse', 'HEAD')
    ref_path = write(env, 'ref-moved.yaml', ref)
    tasks = env['tmp'] / 'tasks.json'
    tasks.write_text(json.dumps([{'pull_number': 9, 'title': 'old PR', 'merge_commit': merge,
                                  'source_files': ['M:lib/billing/old-charge.ts', 'A:lib/billing/gone.ts']}]))
    argv = ['--reference', str(ref_path), '--ownership', str(FIX / 'ownership.json'), '--schema', str(SCHEMA),
            '--source-repo', str(env['repo']), '--tasks', str(tasks), '--out-dir', str(env['tmp'] / 'mv'),
            str(write(env, 'cand.yaml', graph(env)))]
    assert score_graph.main(argv) == 0
    loc = json.loads((env['tmp'] / 'mv' / 'cand.score.json').read_text())['localization']
    assert loc['renamed'] == [{'task': 9, 'path': 'lib/billing/old-charge.ts', 'now': 'lib/billing/charge.ts'}]
    assert [x['path'] for x in loc['excluded']] == ['lib/billing/gone.ts']
    assert loc['per_task'][0]['eligible_files'] == 1 and loc['per_task'][0]['excluded_files'] == 1
