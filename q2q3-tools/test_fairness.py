"""Fairness labels for hidden tests (2026-11-25), judged like SWE-bench Verified's 'valid solutions rejected' check,
against what every condition gets: the PR description, the spec (specs-final) and the code at the base commit. The
intent paragraph is not counted, so the fair set is the same for every condition.
  fair       the checked behavior is stated in the description or spec, or follows from conventions in the base code
  ambiguous  a reasonable reading of the task gives a different, valid answer than the one the test expects
  unfair     the test checks a detail nothing available to the agent determines
Writes test_fairness.json; labels are matched to tests by substring of the test id."""
import json, pathlib
L = {
 19626: [
  ('passes the loading prop', 'fair', 'spec names isLoading'),
  ('happy path, slots in current month', 'fair', 'description: month skipping uses the browsed month'),
  ('check for infinite loop', 'fair', 'description: month skipping logic'),
  ('only slots in the next month', 'fair', 'description: month skipping logic'),
  ('Should render correctly with default date', 'fair', 'spec gives the selected-month-label <time> element'),
  ('browsingDate >= minDate', 'fair', 'spec gives the label; existing behavior'),
  ('browsingDate < minDate', 'unfair', 'clamping the month to minDate is one of the unmentioned "few other TS fixes"'),
 ],
 24207: [('BotDetectionService', 'fair', 'passes in every run under every condition')],
 22024: [
  ('should handle SMS sending errors', 'fair', 'base already rethrows; needs SMS for non-team events, which the description states ("for all users")'),
  ('both phone number and @sms.cal.com email are present', 'unfair', 'expects the rate-limit key "handleSendingSMS:user:1" and userId in the payload, invented by the PR'),
  ('sendSMSToAttendees > should send SMS only to attendees', 'fair', 'description: phone-based booking enabled for all users'),
 ],
 19997: [
  ('Should add number field with price', 'fair', 'spec: price inputs are spinbuttons'),
  ('Should add boolean field with price', 'fair', 'spec: price inputs are spinbuttons'),
  ('field with price and options', 'unfair', 'needs a fix to an existing bug: the base options editor mutates its value in place, so a new option never renders under the test; not mentioned anywhere'),
  ('using locale', 'unfair', 'radio answers arrive as "premium ($20.00)", the option formatted with its price, which must be parsed back'),
  ('should calculate total amount with', 'ambiguous', 'field prices are in dollars while the total is in cents; the unit is not stated and keeping everything in cents is just as reasonable',
   'convention', 'A field or option `price` is in whole currency units (for example dollars), while `handlePayment` keeps the payment amount in the smallest unit (cents), so a price of 15 adds 1500 to the amount.'),
 ],
 20646: [
  ('should update container height correctly', 'unfair', 'exact style values after hiding ("" height, display none) are unstated'),
  ('should adjust skeletonContainer height correctly', 'unfair', 'exact style values after hiding (modal keeps display "") are unstated and differ from non-modal'),
  ('Theme Handling', 'fair', 'description: light/dark theme support; spec names the theme helpers and the shared MediaQueryList'),
  ('Layout Handling', 'ambiguous', 'switching to mobile at 768px and on resize is hinted (spec getTrueLayout/resizeHandler, the Booker uses 768px) but not stated', 'behavior', None),
  ('Loader Behavior', 'fair', 'description: show skeleton or default loader; display block/none follows the existing loader code'),
  ('should escape special characters', 'unfair', 'expects one specific escaping (&#39; for quotes)'),
  ('should return empty string for empty object', 'fair', 'follows from the signature'),
  ('all null/undefined values', 'fair', 'follows from the signature'),
  ('generateDataAttributes', 'ambiguous', 'expects keys converted to kebab-case (data-test-key); keeping them as given is also valid HTML',
   'convention', '`generateDataAttributes` writes each key as a kebab-case `data-` attribute (`testKey` and `TestKey` both become `data-test-key`).'),
 ],
}
tasks = json.load(open(pathlib.Path(__file__).parent.parent / 'benchmark/tasks.json'))
out = {}
for pull, rules in L.items():
    t = next(t for t in tasks if t['pull_number'] == pull)
    out[str(pull)] = {}
    for test in t['FAIL_TO_PASS']:
        rule = next(r for r in rules if r[0] in test)
        entry = {'label': rule[1], 'reason': rule[2]}
        if len(rule) > 3:
            entry['kind'] = rule[3]
            if rule[4]:
                entry['clarification'] = rule[4]
        out[str(pull)][test] = entry
# Labels for the other PRs, written per PR in fairness/<PR>.json (same format), are merged in.
for f in sorted((pathlib.Path(__file__).parent / 'fairness').glob('*.json')):
    out[f.stem] = json.load(open(f))
json.dump(out, open(pathlib.Path(__file__).parent / 'test_fairness.json', 'w'), indent=1)
for p, d in out.items():
    c = {k: sum(v['label'] == k for v in d.values()) for k in ('fair', 'ambiguous', 'unfair')}
    print(p, len(d), c)
