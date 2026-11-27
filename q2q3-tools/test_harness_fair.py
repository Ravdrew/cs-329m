#!/usr/bin/env python3
"""Checks for the fair-only score in harness.py evaluate.  Run: python3 -m pytest -q test_harness_fair.py"""
import json
from pathlib import Path

import harness

HERE = Path(__file__).resolve().parent
LABELS = {
    'a::fair': {'label': 'fair', 'reason': 'spec'},
    'a::convention': {'label': 'ambiguous', 'kind': 'convention', 'clarification': 'cents', 'reason': 'units'},
    'a::behavior': {'label': 'ambiguous', 'kind': 'behavior', 'reason': 'two readings'},
    'a::unfair': {'label': 'unfair', 'reason': 'unmentioned fix'},
}


def labels_file(tmp_path, labels=LABELS, pull=7):
    f = tmp_path / 'fairness.json'
    f.write_text(json.dumps({str(pull): labels}))
    return f


def test_only_fair_and_convention_tests_count(tmp_path):
    f2p = {'a::fair': 'passed', 'a::convention': 'passed', 'a::behavior': 'failed', 'a::unfair': 'missing'}
    s = harness.fair_score(7, f2p, None, labels_file(tmp_path))
    assert (s['fair_passed'], s['fair_total'], s['fair_resolved']) == (2, 2, True)
    assert s['fair_excluded'] == ['a::behavior', 'a::unfair']
    assert s['fair_error'] is None and len(s['fairness_sha256']) == 64


def test_a_failing_fair_test_or_a_test_error_is_not_resolved(tmp_path):
    f = labels_file(tmp_path)
    f2p = {'a::fair': 'failed', 'a::convention': 'passed', 'a::behavior': 'passed', 'a::unfair': 'passed'}
    assert harness.fair_score(7, f2p, None, f)['fair_resolved'] is False
    ok = dict.fromkeys(LABELS, 'passed')
    s = harness.fair_score(7, ok, {'reason': 'crash'}, f)
    assert (s['fair_passed'], s['fair_resolved']) == (2, False)


def test_unlabelled_task_gives_null_scores(tmp_path):
    s = harness.fair_score(8, {'b::x': 'passed'}, None, labels_file(tmp_path))
    assert s['fair_total'] is None and s['fair_resolved'] is None and s['fair_error'] is None


def test_labels_that_do_not_match_the_tests_give_null_scores_with_an_error(tmp_path):
    f2p = {'a::fair': 'passed', 'a::new': 'passed'}
    s = harness.fair_score(7, f2p, None, labels_file(tmp_path))
    assert s['fair_total'] is None
    assert '1 unlabelled, 3 not in F2P' in s['fair_error']


def test_no_scored_tests_is_never_resolved(tmp_path):
    f = labels_file(tmp_path, {'a::unfair': LABELS['a::unfair']})
    s = harness.fair_score(7, {'a::unfair': 'passed'}, None, f)
    assert (s['fair_passed'], s['fair_total'], s['fair_resolved']) == (0, 0, False)


def test_real_labels_cover_their_tasks_and_score_each_tier():
    tasks = {t['pull_number']: t for t in json.load(open(HERE.parent / 'benchmark' / 'tasks.json'))}
    labelled = json.load(open(HERE / 'test_fairness.json'))
    total = t1 = t12 = 0
    for pull in labelled:
        f2p = dict.fromkeys(tasks[int(pull)]['FAIL_TO_PASS'], 'passed')
        s = harness.fair_score(int(pull), f2p, None)
        assert s['fair_error'] is None, (pull, s['fair_error'])
        total += s['fair_total']; t1 += s['tier1_total']; t12 += s['tier12_total']
        assert s['tier1_resolved'] is True and s['tier12_resolved'] is True
    # fair_* is the older rule (fair, plus convention-ambiguous); the tiers are TEST-FAIRNESS.md's 237 and 237 + 74.
    assert (len(labelled), total, t1, t12) == (20, 276, 237, 311)
