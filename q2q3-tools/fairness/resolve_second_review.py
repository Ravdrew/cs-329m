"""Merge the blind second review (fairness/second-review/<PR>.json, 2026-11-25) into the first labels
(fairness/<PR>.json) for the 11 PRs that had non-fair first labels. Decisions by Jo, 2026-11-26.

Each test is compared on its category: fair, convention (ambiguous/convention), behavior (ambiguous/behavior), unfair.
  - Same category in both reviews: the first label stands.
  - Listed in OVERRIDES: that final label, by Jo's decision.
  - Fair in one review and ambiguous in the other: ambiguous. A test is fair (tier 1) only if both reviews say fair.
  - Anything else is unresolved and stops the script.

The first and second labels are kept in each entry (`first_review`, `second_review`) so the merge can be rerun and
audited. Run from q2q3-tools/: python3 fairness/resolve_second_review.py && python3 test_fairness.py
"""
import json, pathlib, sys

HERE = pathlib.Path(__file__).parent
DATE = '2026-11-26'

# Applied only to tests the two reviews disagree on.
# (PR, substring of the test id, final label, kind or None, number of disagreeing tests it must match, reason)
OVERRIDES = [
    ('24880', 'should calculate layout for single event', 'unfair', None, 1,
     'Asserts the default width 80 and zIndex 60, which appear nowhere in the description, spec or base (base EventList.tsx uses 90/61).'),
    ('24880', 'should calculate cascading layout for two overlapping events', 'unfair', None, 1,
     'Asserts the unstated defaults (offset step 8, width 80, zIndex 60/61).'),
    ('24880', 'should calculate cascading layout for three overlapping events', 'unfair', None, 1,
     'Asserts offsets and zIndex values that follow only from the unstated defaults (step 8, zIndex 60).'),
    ('24880', 'should maintain full width for small overlap groups', 'unfair', None, 1,
     'Asserts width 80 and offsets 0/8/16, unstated defaults; the base used width 90.'),
    ('24880', 'createLayoutMap > should create a map from event ID to layout', 'unfair', None, 1,
     'The map keyed by event id follows from the signature, but the test also asserts leftOffsetPercent 8, the unstated default step.'),
    ('24880', 'should compress offset step for dense overlaps', 'fair', None, 1,
     'The description (10+ overlapping events must not bleed into adjacent columns) implies left+width <= 100 with an increasing cascade; no constants are asserted.'),
    ('26217', 'P2002 Error Handling (non-token flow) > returns 409', 'unfair', None, 6,
     'The description limits the 409 to the invite-token flow; nothing says the non-token user.create should catch P2002, or which targets map to USER_ALREADY_EXISTS.'),
    ('26217', 'P2002 Error Handling (non-token flow) > re-throws', 'fair', None, 4,
     'Re-throwing is the base behavior (base user.create has no try/catch); the test fails at base only through the spec-named constants import, and fails an agent only if it catches P2002 too broadly.'),
    ('26217', 'selfHostedHandler – signup P2002 contract > Successful Creation > returns 201 when user is created via invite', 'unfair', None, 1,
     'Base selfHostedHandler.ts:115 destructures { membership } from createOrUpdateMemberships, which the test mocks to return undefined, so passing needs an unmentioned change to that code (checked 2026-11-26).'),
    ('26217', 'selfHostedHandler – signup P2002 contract > Invite flow - existing user validation > returns 201 when', 'unfair', None, 1,
     'Needs the unstated invitedTo exception and also the unmentioned createOrUpdateMemberships change (base selfHostedHandler.ts:115).'),
    ('24324', 'createReport > should create a booking report', 'ambiguous', 'behavior', 2,
     'Data fields map from CreateBookingReportInput, but the exact call also needs select: { id: true }; the return type hints at it, and no base repository selects id on create.'),
    ('24324', 'findAllReportedBookings > should find all reported bookings with pagination', 'unfair', None, 1,
     'The exact findMany call includes orderBy { createdAt: "desc" }, which nothing states.'),
    ('24124', 'summary from external event overrides title', 'ambiguous', 'behavior', 1,
     'Mapping event.summary to responses.title (rather than ignoring it or using another key) is not stated; base maps description to notes but nothing maps a summary.'),
    ('24124', 'partially overrides — only summary changed', 'ambiguous', 'behavior', 1,
     'Same summary -> title mapping, which is not stated anywhere.'),
    ('24124', 'passes correct bookingMeta flags', 'unfair', None, 1,
     'Exact bookingMeta equality needs skipAvailabilityCheck and skipEventLimitsCheck, which nothing asks for; the description mentions only skipCalendarSyncTaskCreation.'),
    ('25315', 'team the booking owner belongs to', 'fair', None, 1,
     'Base BookingAccessService.ts already checks the booking owner\'s teams through getUserOrganizationAndTeams, and bookingOwnerId is in the input.'),
    ('25313', 'should default to S256 method when none specified', 'ambiguous', 'behavior', 1,
     'The spec makes method optional with no default; RFC 7636 4.3 defaults to plain, and returning false is also valid. The S256 hint was removed from the spec on 2026-11-02.'),
    ('27378', 'should log debug messages', 'unfair', None, 1,
     'Needs taskId in the "Webhook delivery task queued" log; base logs only operationId and nothing asks for taskId.'),
    ('27428', 'contenteditable elements', 'unfair', None, 2,
     'Passes only via a jsdom quirk: jsdom implements neither isContentEditable nor contentEditable reflection, so only the expando check el.contentEditable === "true" passes. No intent or graph could supply this.'),
    ('30354', 'never ends before the selected date', 'ambiguous', 'behavior', 1,
     'Clamping dateTo to at least the selected day is never stated, and the assertion depends on an exact end-of-day string.'),
    ('30354', 'returns nothing when only calendars of other integrations are selected', 'fair', None, 1,
     'Same early return as base getAvailability; __mocks__/googleapis.ts ships with the hidden tests (task_overrides.json, 2026-11-02), so the eventsListMock import is not the agent\'s job.'),
]


def category(e):
    if e['label'] == 'ambiguous':
        return e.get('kind', 'behavior')
    return e['label']


def main():
    used = {i: 0 for i in range(len(OVERRIDES))}
    unresolved = []
    for f in sorted((HERE / 'second-review').glob('*.json')):
        pr = f.stem
        second = json.load(open(f))
        path = HERE / f'{pr}.json'
        current = json.load(open(path))
        if set(second) != set(current):
            sys.exit(f'{pr}: second review covers different tests than the first labels')
        out = {}
        for test, e in current.items():
            first = e.get('first_review') or {k: e[k] for k in ('label', 'kind', 'reason', 'clarification') if k in e}
            s = second[test]
            entry = dict(first)
            entry['first_review'] = first
            entry['second_review'] = {k: s[k] for k in ('label', 'kind', 'reason', 'confidence') if k in s}
            c1, c2 = category(first), category(s)
            hits = [i for i, o in enumerate(OVERRIDES) if o[0] == pr and o[1] in test] if c1 != c2 else []
            if len(hits) > 1:
                sys.exit(f'{pr}: several overrides match {test}')
            if c1 == c2:
                pass
            elif hits:
                i = hits[0]
                used[i] += 1
                _, _, label, kind, _, reason = OVERRIDES[i]
                entry = {'label': label, 'reason': reason, 'first_review': first, 'second_review': entry['second_review'],
                         'resolution': f'Disagreement ({c1} vs {c2}) resolved by Jo, {DATE}.'}
                if kind:
                    entry['kind'] = kind
            elif {c1, c2} <= {'fair', 'convention', 'behavior'} and 'fair' in (c1, c2):
                amb = first if c1 != 'fair' else s
                entry = {'label': 'ambiguous', 'kind': category(amb), 'reason': amb['reason'],
                         'first_review': first, 'second_review': entry['second_review'],
                         'resolution': f'Fair in one review only ({c1} vs {c2}); fair requires both reviews, {DATE}.'}
            else:
                unresolved.append((pr, test, c1, c2))
                continue
            entry.pop('clarification', None)  # all 16 drafted clarifications rejected, 2026-11-26
            out[test] = entry
        json.dump(out, open(path, 'w'), indent=2, ensure_ascii=False)
        open(path, 'a').write('\n')
    bad = [(OVERRIDES[i][0], OVERRIDES[i][1], n, OVERRIDES[i][4]) for i, n in used.items() if n != OVERRIDES[i][4]]
    if unresolved or bad:
        for u in unresolved:
            print('UNRESOLVED', *u)
        for b in bad:
            print('OVERRIDE MATCH COUNT', *b)
        sys.exit(1)
    print(f'resolved; {sum(used.values())} tests set by override')


if __name__ == '__main__':
    main()
