# Cal.diy PR audit — SWE-bench-style benchmark tasks

*2026-10-18. Author: Claude (for Andres). Status: candidates verified mechanically; needs human review of the "graph edit" judgement.*

## TL;DR

- Mined **4,574** squash-merged PRs from `calcom/cal.diy` history since 2025-01-01 (no GitHub API needed; `gh` auth on this machine is broken, so everything came from `git log` on a blob-less clone).
- **1,188** touch tests, **400** add new unit-test files; after filtering out areas Cal.com removed when it open-sourced Cal.diy (orgs/teams, workflows, routing forms, insights, API v1, instant booking, PBAC, SAML, booking audit, AI phone) and non-feature commits, **118** candidates remained.
- Hand-picked **47** feature-like candidates and ran a SWE-bench-style **FAIL_TO_PASS** check on each: checkout the parent commit, drop in the PR's test files, run vitest (expect failures), checkout the merge commit, run again (expect all pass).
- **37 of 47 confirmed.** Two of those are in areas that no longer exist at Cal.diy HEAD, and one pair is a duplicate merge, leaving **34 usable tasks**. The **20 recommended below** are the ones whose change reads most naturally as a graph edit (new node, new edge, or a changed edge between existing components); 14 more are in reserve.
- Full machine-readable instances (base commit, test files, FAIL_TO_PASS / PASS_TO_PASS test ids, test command) are in `benchmark/tasks.json`.

## Recommended 20 tasks

Tier A = the feature is a new component or a new relationship between components (best fit for Q3). Tier B = a change inside or between existing components that a graph edit can still point at. Tests are vitest unit/component tests that run offline in a few seconds.

| Tier | PR | Merged | Title | Src files | +/- | F2P tests | As a graph edit |
|---|---|---|---|---|---|---|---|
| A | [#24324](https://github.com/calcom/cal.diy/pull/24324) | 2025-10-14 | feat: report booking | 14 | +1272/-4 | 13 | New *Report booking* dialog + tRPC endpoint + `BookingReport` model, wired from the bookings list and cancel flow |
| A | [#27405](https://github.com/calcom/cal.diy/pull/27405) | 2026-02-10 | feat: Write wrong assignment reports to the database | 7 | +513/-2 | 25 | New `WrongAssignmentReportRepository` (model) + endpoint, called from a new dialog on the booking page |
| A | [#27378](https://github.com/calcom/cal.diy/pull/27378) | 2026-01-29 | feat: implement webhook tasker with async/sync fallback | 16 | +538/-67 | 24 | New webhook tasker service with async/sync fallback, inserted between booking services and webhook delivery |
| A | [#24124](https://github.com/calcom/cal.diy/pull/24124) | 2026-02-26 | feat: Calendar Sync | 4 | +1877/-42 | 52 | New `CalendarSyncService` edge from cancel-booking and routed-users into calendar subscription |
| A | [#25313](https://github.com/calcom/cal.diy/pull/25313) | 2025-11-26 | feat: OAuth PKCE | 13 | +2032/-108 | 26 | OAuth PKCE: new repository + changes to token/refresh/authorize endpoints and admin page |
| A | [#24207](https://github.com/calcom/cal.diy/pull/24207) | 2025-10-06 | feat: botid enabled on api/book/event api route | 9 | +340/-0 | 7 | New edge: book-event endpoint → bot-detection service (feature-flagged) |
| A | [#27088](https://github.com/calcom/cal.diy/pull/27088) | 2026-03-06 | feat: make source required on EventBusyDetails for Troubleshooter disp | 10 | +722/-58 | 14 | Availability/busy-times services must emit a `source`; troubleshooter page renders it |
| A | [#27192](https://github.com/calcom/cal.diy/pull/27192) | 2026-01-23 | feat: display assignment reason in organizer emails and booking single | 10 | +273/-29 | 10 | Assignment reason shown in organizer emails and on the booking page (service → email template, page) |
| A | [#22024](https://github.com/calcom/cal.diy/pull/22024) | 2025-06-27 | feat: Phone based bookings for everyone (#21320) | 5 | +444/-66 | 3 | Phone-based bookings: booking-fields service + event-type advanced tab + SMS (re-merge of #21320) |
| A | [#19997](https://github.com/calcom/cal.diy/pull/19997) | 2025-09-16 | feat: Custom Fields OR Add-Ons with a fee associated | 12 | +822/-40 | 11 | Booking-form add-ons with a fee: form builder → booking form → payment page |
| B | [#27428](https://github.com/calcom/cal.diy/pull/27428) | 2026-02-19 | feat: add keyboard shortcuts and tooltips to booking slideover buttons | 4 | +899/-109 | 25 | Keyboard shortcuts + tooltips on the booking slideover (new handler module + component changes) |
| B | [#27208](https://github.com/calcom/cal.diy/pull/27208) | 2026-02-10 | feat: add filter segment validation with useActiveFiltersValidator hoo | 9 | +1164/-344 | 10 | New `useActiveFiltersValidator` hook between the bookings list page and the data-table provider |
| B | [#30354](https://github.com/calcom/cal.diy/pull/30354) | 2026-10-18 | feat: overlay calendar v2 and troubleshooter v2 | 22 | +1082/-68 | 30 | Overlay calendar v2 + troubleshooter v2 across Booker, AvailableTimes, Google Calendar service (large: 22 files) |
| B | [#26039](https://github.com/calcom/cal.diy/pull/26039) | 2026-01-06 | feat: Hubspot write to meeting object | 11 | +1732/-1 | 22 | HubSpot app: write to meeting object (new CRM settings component + app-store lib) |
| B | [#20646](https://github.com/calcom/cal.diy/pull/20646) | 2025-04-16 | feat: Embed - Show skeleton loader when pageType is provided | 19 | +1645/-268 | 22 | Embed: skeleton loader when `pageType` is provided (embed-core + embed-react) |
| B | [#24880](https://github.com/calcom/cal.diy/pull/24880) | 2025-11-05 | feat: improve overlapping events display in weekly calendar view | 8 | +1268/-166 | 21 | Weekly calendar view: overlapping events layout (component) |
| B | [#25315](https://github.com/calcom/cal.diy/pull/25315) | 2025-11-21 | fix: access service class for editLocationHandler | 2 | +467/-1 | 8 | New edge: editLocation endpoint → `CredentialAccessService` (new service) |
| B | [#26217](https://github.com/calcom/cal.diy/pull/26217) | 2026-01-06 | fix: handle existing users on invite token flow | 6 | +976/-154 | 29 | Signup/invite-token flow handles existing users (auth handlers + signup page) |
| B | [#19626](https://github.com/calcom/cal.diy/pull/19626) | 2025-03-25 | fix: skip when browsing month has no available slots | 10 | +240/-46 | 7 | Booker skips months with no slots (Booker, DatePicker, store, AvailableTimes) |
| B | [#24465](https://github.com/calcom/cal.diy/pull/24465) | 2025-10-15 | fix: Faulty logic around `shouldServeCache` | 2 | +229/-2 | 7 | Calendar cache: `shouldServeCache` logic between Google Calendar service and cache |

**Reserve (confirmed, smaller or more unit-level):** [#25568](https://github.com/calcom/cal.diy/pull/25568), [#27211](https://github.com/calcom/cal.diy/pull/27211), [#25334](https://github.com/calcom/cal.diy/pull/25334), [#27923](https://github.com/calcom/cal.diy/pull/27923), [#21317](https://github.com/calcom/cal.diy/pull/21317), [#25513](https://github.com/calcom/cal.diy/pull/25513), [#27042](https://github.com/calcom/cal.diy/pull/27042), [#26373](https://github.com/calcom/cal.diy/pull/26373), [#27634](https://github.com/calcom/cal.diy/pull/27634), [#20764](https://github.com/calcom/cal.diy/pull/20764), [#22323](https://github.com/calcom/cal.diy/pull/22323), [#25615](https://github.com/calcom/cal.diy/pull/25615), [#27574](https://github.com/calcom/cal.diy/pull/27574), [#27620](https://github.com/calcom/cal.diy/pull/27620).

**Confirmed but excluded:** [#24318](https://github.com/calcom/cal.diy/pull/24318) (packages/features/pbac no longer exists in cal.diy); [#22311](https://github.com/calcom/cal.diy/pull/22311) (apps/web/lib/plain (Plain support widget) no longer exists in cal.diy); #21320 is the first merge of #22024 (same patch) and is dropped as a duplicate.

## Method

1. **Mine** (`benchmark/scripts/mine_prs.py`): `git log --name-status main --since 2025-01-01`; keep commits whose subject ends in `(#NNNN)` (Cal.com squash-merges every PR). Classify each changed path as unit test (`*.test.ts[x]`, `*.spec.ts`, `__tests__/`), e2e test (`*.e2e.ts`, `playwright/`), source, or non-code.
2. **Filter** (`benchmark/scripts/filter_candidates.py`): require ≥1 *added* unit-test file and ≥1 non-test source change; drop paths in areas removed from Cal.diy and `chore/ci/docs/refactor/revert/bump/i18n` titles; score `feat` > `fix`, prefer 1–12 source files.
3. **Pick** 47 by hand from the top of that list, favouring PRs that add a page, endpoint, service, model, or a new relationship between them.
4. **Verify** (`benchmark/scripts/verify_prs.py`): in a full worktree (`benchmark/work`), for each PR with merge commit C and parent P: checkout P (re-running `yarn install` only when `yarn.lock` changed), `git checkout C -- <test files>`, `TZ=UTC yarn vitest run --reporter=json <test files>`; then checkout C and run again. Confirmed iff ≥1 test fails-then-passes, nothing passes-then-fails, and every test passes at C. Per-test ids are recorded as FAIL_TO_PASS / PASS_TO_PASS exactly as SWE-bench does.

Runtime: ~1.5 h wall-clock for 47 PRs, dominated by `yarn install` at older commits (Cal.com switched from yarn 3.4 to yarn 4.12 in early 2026).

## Why 10 were not confirmed

| PR | Reason |
|---|---|
| #27909, #27894, #25794, #24122 | The new tests already pass before the patch (they test new helpers in isolation or assert behaviour the old code already had). Not usable as an oracle. |
| #24912 | The PR *moves* `bookingActions.test.ts`; before/after test ids differ, so my matcher reports 38 F2P and 38 P2F. Fixable by matching on test title rather than path; likely confirmable. |
| #25556 | 8 OAuth/PKCE tests fail at the merge commit too in this environment (probably need env vars). Flaky for us. |
| #19605, #20451 | Older (Mar/Apr 2025) commits: some pre-existing tests in the modified files fail in this environment both before and after. |
| #23595, #26218 | `yarn install` failed at the parent commit (yarn 3 era) so vitest was missing. Needs a retry with the install log (the script now records it). |

## Caveats to review

- **Unit tests only.** Nothing here needs Postgres or a browser. Cal.com's Playwright e2e suites would be a stronger oracle for UI-level features (proposal §4 mentions SWE-Lancer-style browser grading) but need a DB and a seeded app; I did not attempt them.
- **"Expressible as a graph edit" is my judgement**, made from titles, bodies and file lists. Someone who has not seen the patch should re-judge each of the 20 and write the prose prompt + graph edit (proposal §4, Datasets).
- **PR bodies as problem statements.** `tasks.json` carries each PR body as `problem_statement`; several are thin (`devin-finish-pr`, bounty PRs). Expect to write prompts by hand.
- **The graph must exist at each task's base commit.** Base commits span Mar 2025 – Oct 2026; file paths moved a lot (e.g. `packages/features/bookings/lib/handleNewBooking.ts` → `service/RegularBookingService.ts`). Either build the graph per base commit (hot-started variant makes this cheap) or restrict tasks to 2026 commits. 29 of the 37 confirmed are from Oct 2025 or later.
- **Environment pinning.** All runs used Node 24.9 and the repo's own yarn; a Dockerfile per base commit would make results reproducible for the agent runs.

## Files

| Path | What |
|---|---|
| `benchmark/tasks.json` | 37 confirmed instances (SWE-bench-like fields) |
| `benchmark/verify_results.jsonl` | Raw before/after results incl. per-test status and vitest output tails |
| `benchmark/table.md` | All 47 verified PRs in one table (reproduced below) |
| `benchmark/prs_since_2025.json` | All 4,574 mined PR commits with classified file lists (3.8 MB, **not committed**; regenerate in ~1 min with `mine_prs.py`, see `benchmark/README.md`) |
| `benchmark/prs_since_2025_candidates.json` | The 118 filtered candidates with scores |
| `benchmark/pr_meta.json` | PR title/body/labels/size from GitHub |
| `benchmark/scripts/` | `mine_prs.py`, `filter_candidates.py`, `verify_prs.py`, `fetch_pr_meta.py`, `summarize.py` |

## Next steps

1. Team re-judges the 20 (and reserve 14) for graph-edit fit; aim to lock 20 by week 6 per the timeline.
2. Retry #23595 and #26218 with the install log; fix the path matcher for #24912.
3. Decide the base-commit policy (per-task graph vs. 2026-only tasks).
4. Write a per-task Dockerfile or at least pin Node and record `yarn.lock` hash per base commit.
5. Consider adding 3–5 tasks with Playwright e2e oracles for UI-heavy features once a DB-backed harness exists.
6. Repeat the pipeline on the second TypeScript app once chosen.

## Appendix: all 47 verified PRs

| PR | Merged | Title | Main areas | Src files | +/- lines | F2P tests | P2P tests | Status | Note |
|---|---|---|---|---|---|---|---|---|---|
| [#19626](https://github.com/calcom/cal.diy/pull/19626) | 2025-03-25 | fix: skip when browsing month has no available slots | packages/features/bookings, packages/features/schedules | 10 | +240/-46 | 7 | 0 | confirmed |  |
| [#20646](https://github.com/calcom/cal.diy/pull/20646) | 2025-04-16 | feat: Embed - Show skeleton loader when pageType is provided | packages/embeds/embed-core, packages/embeds/embed-react | 19 | +1645/-268 | 22 | 0 | confirmed |  |
| [#21317](https://github.com/calcom/cal.diy/pull/21317) | 2025-05-15 | fix: Seated events and round robin - all round robin hosts are being added to th | packages/features/bookings | 1 | +410/-45 | 7 | 0 | confirmed |  |
| [#21320](https://github.com/calcom/cal.diy/pull/21320) | 2025-06-20 | feat: Phone based bookings for everyone | packages/features/bookings, packages/features/eventtypes | 5 | +432/-67 | 3 | 6 | confirmed |  |
| [#22024](https://github.com/calcom/cal.diy/pull/22024) | 2025-06-27 | feat: Phone based bookings for everyone (#21320) | packages/features/bookings, packages/features/eventtypes | 5 | +444/-66 | 3 | 6 | confirmed |  |
| [#20764](https://github.com/calcom/cal.diy/pull/20764) | 2025-07-08 | fix: improve redirect parameter handling for success page | packages/lib/bookingSuccessRedirect.ts | 1 | +35/-2 | 2 | 0 | confirmed |  |
| [#22323](https://github.com/calcom/cal.diy/pull/22323) | 2025-07-09 | fix: Do not wait for slots request before removing the | packages/embeds/embed-core | 2 | +144/-41 | 3 | 34 | confirmed |  |
| [#22311](https://github.com/calcom/cal.diy/pull/22311) | 2025-07-24 | feat: Add contact form for free users in Plain support widget | apps/web, packages/ui/components | 7 | +1334/-12 | 17 | 0 | confirmed |  |
| [#19997](https://github.com/calcom/cal.diy/pull/19997) | 2025-09-16 | feat: Custom Fields OR Add-Ons with a fee associated | packages/features/bookings, packages/features/form-builder | 12 | +822/-40 | 11 | 15 | confirmed |  |
| [#24207](https://github.com/calcom/cal.diy/pull/24207) | 2025-10-06 | feat: botid enabled on api/book/event api route | apps/web, packages/features/bot-detection | 9 | +340/-0 | 7 | 0 | confirmed |  |
| [#24318](https://github.com/calcom/cal.diy/pull/24318) | 2025-10-09 | fix: event-type permissions | packages/features/pbac, packages/trpc/server | 5 | +1481/-147 | 31 | 40 | confirmed |  |
| [#24324](https://github.com/calcom/cal.diy/pull/24324) | 2025-10-14 | feat: report booking | packages/trpc/server, apps/web | 14 | +1272/-4 | 13 | 0 | confirmed |  |
| [#24465](https://github.com/calcom/cal.diy/pull/24465) | 2025-10-15 | fix: Faulty logic around `shouldServeCache` | packages/app-store/googlecalendar, packages/features/calendar-cache | 2 | +229/-2 | 7 | 7 | confirmed |  |
| [#24880](https://github.com/calcom/cal.diy/pull/24880) | 2025-11-05 | feat: improve overlapping events display in weekly calendar view | packages/features/calendars, apps/web | 8 | +1268/-166 | 21 | 0 | confirmed |  |
| [#25334](https://github.com/calcom/cal.diy/pull/25334) | 2025-11-21 | fix: signup | packages/features/auth, packages/lib/server | 7 | +713/-103 | 18 | 2 | confirmed |  |
| [#25315](https://github.com/calcom/cal.diy/pull/25315) | 2025-11-21 | fix: access service class for editLocationHandler | packages/features/credentials, packages/trpc/server | 2 | +467/-1 | 8 | 0 | confirmed |  |
| [#25313](https://github.com/calcom/cal.diy/pull/25313) | 2025-11-26 | feat: OAuth PKCE | apps/web, packages/trpc/server | 13 | +2032/-108 | 26 | 2 | confirmed |  |
| [#25513](https://github.com/calcom/cal.diy/pull/25513) | 2025-12-09 | fix: block Google Meet installation without Google Calendar dependency | apps/web, packages/app-store/AppDependencyComponent.tsx | 3 | +290/-9 | 3 | 10 | confirmed |  |
| [#25568](https://github.com/calcom/cal.diy/pull/25568) | 2025-12-12 | feat: add time shift badge for recurring events with shifted local times | apps/web, packages/features/bookings | 3 | +160/-12 | 4 | 0 | confirmed |  |
| [#25615](https://github.com/calcom/cal.diy/pull/25615) | 2025-12-22 | fix: ESC key handler only works once in embed modal | packages/embeds/embed-core | 2 | +172/-13 | 2 | 16 | confirmed |  |
| [#26373](https://github.com/calcom/cal.diy/pull/26373) | 2026-01-02 | fix: Custom time input for availability | packages/features/schedules | 1 | +384/-29 | 33 | 0 | confirmed |  |
| [#26039](https://github.com/calcom/cal.diy/pull/26039) | 2026-01-06 | feat: Hubspot write to meeting object | packages/app-store/_components, packages/app-store/hubspot | 11 | +1732/-1 | 22 | 0 | confirmed |  |
| [#26217](https://github.com/calcom/cal.diy/pull/26217) | 2026-01-06 | fix: handle existing users on invite token flow | packages/features/auth, apps/web | 6 | +976/-154 | 29 | 0 | confirmed |  |
| [#27042](https://github.com/calcom/cal.diy/pull/27042) | 2026-01-21 | fix: handle invalid timezones gracefully in calendar events | packages/features/calendars | 2 | +311/-1 | 25 | 18 | confirmed |  |
| [#27192](https://github.com/calcom/cal.diy/pull/27192) | 2026-01-23 | feat: display assignment reason in organizer emails and booking single view | packages/features/bookings, apps/web | 10 | +273/-29 | 10 | 35 | confirmed |  |
| [#27211](https://github.com/calcom/cal.diy/pull/27211) | 2026-01-26 | feat: add multi-step download app dropdown with platform-specific options | apps/web, packages/ui/components | 5 | +1151/-161 | 19 | 6 | confirmed |  |
| [#27378](https://github.com/calcom/cal.diy/pull/27378) | 2026-01-29 | feat: implement webhook tasker with async/sync fallback | packages/features/di, packages/features/webhooks | 16 | +538/-67 | 24 | 0 | confirmed |  |
| [#27574](https://github.com/calcom/cal.diy/pull/27574) | 2026-02-03 | fix: prevent video redirect when booking additional seats | apps/web | 1 | +317/-3 | 2 | 2 | confirmed |  |
| [#27620](https://github.com/calcom/cal.diy/pull/27620) | 2026-02-04 | fix: prevent attendee phone number from overriding organizer default app locatio | packages/features/bookings | 1 | +234/-4 | 2 | 3 | confirmed |  |
| [#27405](https://github.com/calcom/cal.diy/pull/27405) | 2026-02-10 | feat: Write wrong assignment reports to the database | packages/trpc/server, packages/features/bookings | 7 | +513/-2 | 25 | 0 | confirmed |  |
| [#27208](https://github.com/calcom/cal.diy/pull/27208) | 2026-02-10 | feat: add filter segment validation with useActiveFiltersValidator hook and refa | packages/features/data-table, apps/web | 9 | +1164/-344 | 10 | 0 | confirmed |  |
| [#27923](https://github.com/calcom/cal.diy/pull/27923) | 2026-02-13 | fix: resolve signup watchlist review issues and auto-unlock on SIGNUP entry remo | packages/features/watchlist, apps/web | 7 | +542/-26 | 8 | 10 | confirmed |  |
| [#27428](https://github.com/calcom/cal.diy/pull/27428) | 2026-02-19 | feat: add keyboard shortcuts and tooltips to booking slideover buttons | apps/web, packages/features/calendars | 4 | +899/-109 | 25 | 0 | confirmed |  |
| [#24124](https://github.com/calcom/cal.diy/pull/24124) | 2026-02-26 | feat: Calendar Sync | packages/features/bookings, packages/features/calendar-subscription | 4 | +1877/-42 | 52 | 23 | confirmed |  |
| [#27088](https://github.com/calcom/cal.diy/pull/27088) | 2026-03-06 | feat: make source required on EventBusyDetails for Troubleshooter display | packages/features/busyTimes, packages/trpc/server | 10 | +722/-58 | 14 | 0 | confirmed |  |
| [#27634](https://github.com/calcom/cal.diy/pull/27634) | 2026-06-22 | fix: implement missing password validation | packages/features/auth, packages/trpc/server | 2 | +116/-23 | 4 | 0 | confirmed |  |
| [#30354](https://github.com/calcom/cal.diy/pull/30354) | 2026-10-18 | feat: overlay calendar v2 and troubleshooter v2 | apps/web, packages/app-store/googlecalendar | 22 | +1082/-68 | 30 | 49 | confirmed |  |
| [#19605](https://github.com/calcom/cal.diy/pull/19605) | 2025-03-02 | fix: Re-instate new slot logic now it's A/B tested in production | packages/core/getAggregatedAvailability.ts, packages/core/getAggregatedAvailability | 4 | +21/-881 | 8 | 16 | not confirmed | yarn install failed at that commit |
| [#20451](https://github.com/calcom/cal.diy/pull/20451) | 2025-04-15 | fix: Improves dialog window that appears when there is no availability in a mont | packages/features/calendars, packages/features/bookings | 7 | +334/-28 | 8 | 4 | not confirmed | yarn install failed at that commit |
| [#23595](https://github.com/calcom/cal.diy/pull/23595) | 2025-09-05 | feat: add time-based cancellation fees for no-show fee events | apps/web, packages/lib/payment | 12 | +1415/-144 | 0 | 0 | not confirmed | yarn install failed at that commit |
| [#24122](https://github.com/calcom/cal.diy/pull/24122) | 2025-09-29 | feat: add booking flags for skipAvailabilityCheck, skipEventLimitsCheck, skipCal | packages/features/bookings | 1 | +505/-76 | 0 | 0 | not confirmed | new tests already pass before the PR (tests do not pin the behaviour) |
| [#24912](https://github.com/calcom/cal.diy/pull/24912) | 2025-11-11 | feat: add booking actions into BookingDetailsSheet | apps/web | 8 | +165/-99 | 38 | 0 | not confirmed | 38 tests fail after the PR too (flaky/env-dependent) |
| [#25794](https://github.com/calcom/cal.diy/pull/25794) | 2025-12-12 | fix: use relative redirects in booking confirmation routes to fix localhost redi | apps/web | 2 | +440/-14 | 0 | 14 | not confirmed | new tests already pass before the PR (tests do not pin the behaviour) |
| [#26218](https://github.com/calcom/cal.diy/pull/26218) | 2025-12-28 | fix(schedules): add missing await on async permission check | packages/features/schedules, packages/trpc/server | 2 | +291/-67 | 0 | 0 | not confirmed | yarn install failed at that commit |
| [#25556](https://github.com/calcom/cal.diy/pull/25556) | 2026-01-21 | feat: add OAuth client developer settings page with approval workflow | apps/web, packages/trpc/server | 39 | +5231/-368 | 8 | 14 | not confirmed | 8 tests fail after the PR too (flaky/env-dependent) |
| [#27909](https://github.com/calcom/cal.diy/pull/27909) | 2026-02-13 | fix: display phone numbers and localized timezone in BookingDetailsSheet | apps/web | 1 | +102/-1 | 0 | 10 | not confirmed | new tests already pass before the PR (tests do not pin the behaviour) |
| [#27894](https://github.com/calcom/cal.diy/pull/27894) | 2026-02-13 | fix: prevent BookingDetailsSheet flicker when switching bookings | apps/web | 2 | +165/-14 | 0 | 7 | not confirmed | new tests already pass before the PR (tests do not pin the behaviour) |
