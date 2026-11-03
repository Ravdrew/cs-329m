# Independent spec reviews (2026-11-02)

Two fresh agents reviewed the specs against the merge commits and hidden tests (read-only).

## Round 1: the 8 hand edits (v2)
Must fix: #19626 (named export and prop rename missing), #25313 (`// method defaults to "S256"` is exactly what a test
checks; schema and input fields missing), #27208 (type placed in an "existing" file that doesn't exist at base), #27378
(changed `WebhookTaskerProducerService` constructor missing; used by 20 of 24 tests). OK: #24207, #24324, #25315, #27428.
All four were fixed in v3 (generator + hand edits).

## Round 2: all 20 final specs (v3)
OK: #24880, #27208, #27378, #27428. Minor: #22024, #24465, #25313, #25315, #27192.
Must fix (11): #19626, #19997, #20646, #24124, #24207, #24324, #26039, #26217, #27088, #27405, #30354.

What the must-fix items need, by kind:
- **Test hooks:** `data-testid` names the tests query (#19626 `selected-month-label`; #19997 `add-option`,
  `options-container`; #30354 `overlay-calendar-google-button` / `-microsoft-button`).
- **Members the tests spy on or inject:** #26039 `getAppOptions`, `trackingRepository`, `bookingRepository`; #27088
  `_getUserAvailability` on `UserAvailabilityService`; #20646 constructor `dataset` under `INTEGRATION_TEST_MODE`.
- **Fields hidden behind zod schemas or `Promise<...>`:** #24124 `skipCalendarSyncTaskCancellation`, #24324
  `skipCancellationReasonValidation` (in `bookingCancelSchema`) and `reportedCount`; #27405 `reportId`; #19997
  `price` fields; #30354 `overlappingTitle`, `title?`, `getEventSegmentForDay` return type.
- **Names of env vars and feature flags:** #24207 `NEXT_PUBLIC_VERCEL_USE_BOTID_IN_BOOKER`, flag key `"booker-botid"`.
- **Types used but never defined:** #20646 `AllPossibleLayouts`, `EmbedPageType`; #30354 `OverlaySocialLoginProvider`.
- **Changed defaults/exports:** #20646 `inlineHTML` default export becomes a function; #26217 non-token path uses
  `prisma.user.create` (was `upsert`).
- **Judgment calls:** #27405 i18n key `wrong_assignment_already_reported` (a test asserts the translated key);
  #30354 `isSelected?` was placed on the wrong type by the type-diff printer (generator bug).

Cross-cutting: the mock list picks up parameter names (`paymentData`, `handler`, `email`) and drops `default:` mocks
bound to variables and factory-less mocks. Unverifiable here: Prisma client regeneration for enum imports at
evaluation (the harness regenerates when an agent edits schema.prisma), `botid` installation for #24207.
Leftover risk no spec can remove: tests that assert exact literals (#20646 `(max-width: 768px)`, #30354 "Microsoft").

## Round 3: all 20, blind, given the rule (after the rule was applied)
No spec reveals asserted behaviour. Must fix (5): #26217 and #27405 (partially mocked modules not listed), #26039
(injected `hubspotClient` and its only stubbed call), #20646 (test setup: replaced `shadowRoot`, a shared
dark-scheme query object), #27428 (`data-radix-portal`). Minor: #30354 (misleading `userHandler` entry, mock
noise), #24124 (`RescheduleBookingData`), #27088 (BusyTimes stub members). All fixed. The generator now parses
mock factories (top-level members, named factories, automocks, differences between test files). The `768px`
breakpoint stays out (asserted value).

## Round 4: fact-check of the round-3 fixes
All accurate. Wording corrections (#20646, #27428), exact stub members (#27405, #25313, #30354, #26217), all
applied. Its two "blocking" items (`windowMatchMedia.ts`, `googleapis.ts`) are test helpers that already ship with
the hidden tests (`task_overrides.json`).
