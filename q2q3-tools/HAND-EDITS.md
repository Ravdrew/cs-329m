# Interface specs: rule, hand edits, status (2026-11-02)

**Status: ready to freeze, after four independent reviews** (`SPEC-REVIEW-2026-11-02.md`). Regenerate with:
`python3 make_spec.py --out specs-generated-v3 <20 PRs>` then `python3 apply_hand_edits.py` (→ `specs-final/`).

## The rule (Jo, 2026-11-02)
- **Interface: goes in the spec.** Anything a hidden test calls, constructs, imports, spies on, injects, sets, or
  looks up by name: file paths, exported names, signatures, types, enum members, Prisma/zod/return field names,
  `data-testid`s and the DOM roles or attributes the tests query or set, env var names, feature-flag keys, i18n
  keys, and mocked modules with the members their mocks define.
- **Behaviour: stays out.** Anything a test compares a result against: message text, asserted values and
  literals, which branch runs, call order, the arguments a test expects a call to receive, and code bodies.

## Generator (make_spec.py v3 + ts_exports.js)
Uses the TypeScript parser and prints signatures only (no bodies, initializers or defaults). It covers:
- new files, new exports, and `export { a }` clauses;
- new methods;
- changed signatures of existing code the tests use (including constructors of classes the tests `new`), with
  changed types shown as deltas;
- Prisma schema additions (names and types only);
- mocked modules and the members their factories define, including named factory functions, automocks, and
  differences between test files. The spec says a mock defines only those members.

## Hand edits (all in apply_hand_edits.py, one block per PR)
| PR | What the hand edit adds or changes |
|---|---|
| #19626 | New `Slots` type; calendars `isPending` → `isLoading`; `selected-month-label` test id on a `<time dateTime>` |
| #19997 | Form-builder `price` fields and pricing flags; dialog structure the tests query (`spinbutton`, `options-container` with `li` rows, `add-option`) |
| #20646 | New `AllPossibleLayouts` / `EmbedPageType` types; `inlineHTML` default export becomes a function; how the tests set up `EmbedElement` (`dataset` injection, replaced `shadowRoot`, setup order, shared `getColorSchemeDarkQuery()` object) |
| #22024, #25313, #25315, #27088, #27192, #27378, #27405, #30354 | Mock lines made exact (static vs instance, what each stub returns, empty `@calcom/prisma`) |
| #24124 | `bookingCancelSchema.skipCalendarSyncTaskCancellation`; `handleCancelBooking` mock; local `RescheduleBookingData` type |
| #24207 | Pilot version; return type of `getTeamIdByEventTypeId`; env var `NEXT_PUBLIC_VERCEL_USE_BOTID_IN_BOOKER`; flag key `"booker-botid"` |
| #24324 | Pilot version; generator's Prisma block; handler return type (`success`, `message`, `bookingUid`, `reportedCount`); `bookingCancelSchema.skipCancellationReasonValidation` |
| #24465 | "No new interface" (instead of an empty file) |
| #25313 | Two optional `ZGenerateAuthCodeInputSchema` fields; no default value (a test checks it) |
| #25315 | Pilot version |
| #26039 | New tracking repository files; `crm-schemas.ts`; `appDataSchema` fields; injected `trackingRepository` / `bookingRepository` / `hubspotClient` / `auth` and the stubbed `getAppOptions()` |
| #26217 | Prisma calls the tests stub; mocked `PrismaClientKnownRequestError`; `NextResponse.json` needs an explicit status; `usernameHandler(handler)` wrapper |
| #27088 | The new method is on `UserAvailabilityService` and goes through the spied `_getUserAvailability` |
| #27192 | `CalendarEvent.assignmentReason` |
| #27208 | `ActiveFiltersValidator` is a new type |
| #27378 | New `tasker/types.ts` and `trigger/schema.ts` re-export |
| #27405 | Handler result `reportId`; i18n key `wrong_assignment_already_reported`; booking select `routedFromRoutingFormReponse.formId`; repository stub client |
| #27428 | Return type of the keydown handler; overlays are marked with `data-radix-portal` |
| #30354 | `OverlaySocialLoginProvider`; `isSelected?` on the right type; `EventBusyDate.title`; optional `Calendar.getAvailabilityWithTitles`; `overlappingTitle`; modal prop and test ids; `getEventSegmentForDay` return type; dropped a misleading `userHandler` "change" |

## Left out on purpose (behaviour under the rule)
- Asserted messages, branch order and expected call arguments: #24324, #27405, #27192, #30354, #26039, #24207.
- #20646's mobile breakpoint `(max-width: 768px)`: the tests assert 768 vs 800, so the value is behaviour.
- Literal labels such as #30354's "Microsoft".

These can cost some tests in every condition equally. The primary metric stays the fraction of tests passed.
