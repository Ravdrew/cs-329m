#!/usr/bin/env python3
"""Build specs-final/ from the generator's output plus the hand edits, reproducibly.

  python3 apply_hand_edits.py          # specs-generated-v3/ (+ the pilot's 3 hand specs) -> specs-final/

The rule for what a spec may say (agreed 2026-11-02):
  INTERFACE (goes in): anything a hidden test calls, constructs, imports, spies on, injects, sets, or looks up by
    name: file paths, exported names, signatures, types, enum members, schema/zod/return field names, data-testid
    names and the DOM roles the tests query, env var names, feature-flag keys, i18n keys, mocked modules/members.
  BEHAVIOUR (stays out): anything a test compares a result against: message text, asserted values and literals,
    which branch runs, call order, the arguments a test expects in a call.
Every edit below cites the hidden-test usage that makes it interface. See HAND-EDITS.md for the table.
"""
import re
import shutil
from pathlib import Path

HERE = Path(__file__).resolve().parent
GEN, OUT, PILOT = HERE / 'specs-generated-v3', HERE / 'specs-final', HERE / 'pilot-specs'
MOCKS = '**Dependencies the tests replace with mocks.**'


def get(p):
    return (OUT / f'{p}.md').read_text()


def put(p, s):
    (OUT / f'{p}.md').write_text(s)


def replace(p, old, new):
    s = get(p)
    assert s.count(old) == 1, (p, old[:70], s.count(old))
    put(p, s.replace(old, new))


def before_mocks(p, block):
    """Insert a block before the mock list (or at the end if there is none)."""
    s, block = get(p), block.strip() + '\n'
    put(p, s.replace(MOCKS, block + '\n' + MOCKS, 1) if MOCKS in s else s.rstrip() + '\n\n' + block)


def mock_line(p, module, text=None):
    """Replace (text) or drop (None) the mock-list line for one module; add it if missing."""
    s = get(p)
    pat = re.compile(rf'^- `{re.escape(module)}`:.*$', re.M)
    if pat.search(s):
        s = pat.sub(text if text else '', s, count=1)
        s = re.sub(r'\n\n\n+', '\n\n', s)
    elif text:
        if MOCKS not in s:
            s = s.rstrip() + '\n\n' + MOCKS + ' The code under test should get its data through these modules ' \
                'and members, because the tests stub them instead of using a database:\n\n'
        s = s.rstrip() + '\n' + text + '\n'
    put(p, s)


def note(p, text):
    put(p, get(p).rstrip() + '\n\n' + text.strip() + '\n')


def main():
    if OUT.exists():
        shutil.rmtree(OUT)
    shutil.copytree(GEN, OUT, ignore=shutil.ignore_patterns('*.json'))
    for p in (24207, 24324, 25315):          # the pilot's hand-finished specs (pilot continuity)
        shutil.copy(PILOT / f'{p}.md', OUT / f'{p}.md')

    # #19626 ------------------------------------------------------------------------------------------------
    before_mocks(19626, '''
**Existing file `packages/features/bookings/types.ts`**, new export:
```ts
export type Slots = Required<NonNullable<DatePickerProps["slots"]>>;
```

**Existing file `packages/features/calendars/DatePicker.tsx`**: in `DatePickerProps`, the `isPending?: boolean` prop is renamed `isLoading?: boolean`. The tests find the month label with `getByTestId("selected-month-label")` and read its `dateTime` attribute; it is a `<time>` element.
''')

    # #19997 ------------------------------------------------------------------------------------------------
    before_mocks(19997, '''
**Existing file `packages/features/form-builder/schema.ts`**: a field gains `price?: number`; each entry of a field's `options` gains `price?: number`; a field type's config (`fieldTypeConfig`) gains `supportsPricing?: boolean` and `optionsSupportPricing?: boolean`.

**Form builder dialog, as the tests query it:** price inputs are number inputs (role `spinbutton`); the options editor is the element with `data-testid="options-container"`, one `li` per option (each with its own price input); new options are added with the `data-testid="add-option"` button.
''')
    mock_line(19997, 'packages/app-store/payment.services.generated.ts', '- `packages/app-store/payment.services.generated.ts`: `PaymentServiceMap`')

    # #20646 ------------------------------------------------------------------------------------------------
    before_mocks(20646, '''
**Existing file `packages/embeds/embed-core/src/types.ts`**, new exports (the tests import them from `src/types`):
```ts
export type AllPossibleLayouts = BookerLayouts | "mobile";
export type EmbedPageType =
  | "team.event.booking.slots"
  | "user.event.booking.slots"
  | "team.event.booking.form"
  | "user.event.booking.form";
```

**Existing file `packages/embeds/embed-core/src/Inline/inlineHtml.ts`**: the default export changes from an HTML string to a function:
```ts
export default html: ({ layout, pageType }: { layout?: AllPossibleLayouts; pageType: EmbedPageType | null }) => string;
```

**How the tests set up `EmbedElement`:** they pass an extra `dataset` (`{ pageType?, theme?, layout? }`) in the constructor's `data` argument. The vitest config already sets `process.env.INTEGRATION_TEST_MODE`; in that mode the constructor should copy `data.dataset` onto the element's `dataset`.

The tests then replace the element's `shadowRoot` with an object that has only `querySelector` and `host`, set the element's `innerHTML` (to `inlineHTML(...)`), and only then append it to the document, so `connectedCallback` should find its elements through `this.shadowRoot.querySelector`. They fake `window.matchMedia` and dispatch `change` events on the object `getColorSchemeDarkQuery()` returns, so that function should create the `MediaQueryList` once and return the same object on every call.
''')

    # #22024 ------------------------------------------------------------------------------------------------
    mock_line(22024, '@calcom/prisma', '- `@calcom/prisma`: default export, with `team.findUnique` stubbed')

    # #24124 ------------------------------------------------------------------------------------------------
    before_mocks(24124, '''
**Existing file `packages/prisma/zod-utils.ts`**: `bookingCancelSchema` gains an optional boolean field `skipCalendarSyncTaskCancellation`.
''')
    mock_line(24124, 'packages/features/bookings/lib/handleCancelBooking.ts',
              '- `packages/features/bookings/lib/handleCancelBooking.ts`: default export `handleCancelBooking`')
    before_mocks(24124, '''
`RescheduleBookingData`, used above, is a local type in `CalendarSyncService.ts`: `CreateRegularBookingData & { responses: Record<string, unknown>; idempotencyKey: string }`.
''')

    # #24207 ------------------------------------------------------------------------------------------------
    replace(24207, '- The two constructor arguments are passed in as stubs: `featuresRepository.checkIfTeamHasFeature` and '
                   '`eventTypeRepository.getTeamIdByEventTypeId` are the only methods the stubs provide.\n', '')
    replace(24207, 'async getTeamIdByEventTypeId({ id }: { id: number });',
            'async getTeamIdByEventTypeId({ id }: { id: number }): Promise<{ teamId: number | null } | null>;')
    note(24207, '''
The two constructor arguments are passed in as stubs: `featuresRepository.checkIfTeamHasFeature` and `eventTypeRepository.getTeamIdByEventTypeId` are the only methods the stubs provide.

**Names the tests use:** they set the environment variable `NEXT_PUBLIC_VERCEL_USE_BOTID_IN_BOOKER` (also add it to `.env.example`), and the team feature flag is a new `AppFlags` key `"booker-botid"` (`packages/features/flags/config.ts`, default off).
''')

    # #24324 ------------------------------------------------------------------------------------------------
    gen = (GEN / '24324.md').read_text()
    schema = re.search(r'\*\*Prisma schema.*?```prisma\n(.*?)```', gen, re.S).group(1)
    s = get(24324)
    old = re.search(r'\*\*Prisma schema \(`packages/prisma/schema.prisma`\)\*\*.*?```\n\n', s, re.S).group(0)
    put(24324, s.replace(old, '**Prisma schema (`packages/prisma/schema.prisma`)**, additions. The tests import the enum '
        'from `@calcom/prisma/enums` and call the model through the client as `prisma.bookingReport` (`create`, '
        '`findMany`, `findFirst`, `findUnique`).\n```prisma\n' + schema + '```\n\n'))
    replace(24324, '}) => Promise<...>;', '}) => Promise<{ success: boolean; message: string; bookingUid: string; reportedCount: number }>;')
    before_mocks(24324, '''
**Existing file `packages/prisma/zod-utils.ts`**: `bookingCancelSchema` gains an optional boolean field `skipCancellationReasonValidation`.
''')

    # #24465 ------------------------------------------------------------------------------------------------
    put(24465, '## Interface the tests expect\n\nThe tests use only code that already exists at this commit. '
               'No new files, exports or signatures are needed.\n')

    # #25313 ------------------------------------------------------------------------------------------------
    before_mocks(25313, '''
**Existing file `packages/trpc/server/routers/viewer/oAuth/generateAuthCode.schema.ts`**: `ZGenerateAuthCodeInputSchema` gains two optional fields, `codeChallenge` and `codeChallengeMethod`.
''')
    mock_line(25313, 'app/api/defaultResponderForAppDir', '- `app/api/defaultResponderForAppDir`: `defaultResponderForAppDir`')
    mock_line(25313, 'next/server', '- `next/server`: `NextRequest`, `NextResponse` (only `NextResponse.json`)')
    mock_line(25313, '@calcom/prisma', '- `@calcom/prisma`: default export (the Prisma client), with `oAuthClient.findFirst` / `findUnique` and `accessCode.findFirst` / `deleteMany` / `create` stubbed')

    # #25315 ------------------------------------------------------------------------------------------------
    mock_line(25315, 'packages/features/credentials/repositories/CredentialRepository.ts',
              '- `packages/features/credentials/repositories/CredentialRepository.ts`: static `CredentialRepository.findFirstByIdWithKeyAndUser`')
    mock_line(25315, 'packages/features/users/repositories/UserRepository.ts',
              '- `packages/features/users/repositories/UserRepository.ts`: `new UserRepository(prisma).getUserOrganizationAndTeams`')

    # #26039 ------------------------------------------------------------------------------------------------
    before_mocks(26039, '''
**New file `packages/lib/server/repository/TrackingRepository.interface.ts`**, exporting:
```ts
export interface TrackingRepositoryInterface {
  findByBookingUid(bookingUid: string): Promise<Tracking | null>;
}
```

**New file `packages/lib/server/repository/PrismaTrackingRepository.ts`**, exporting:
```ts
export class PrismaTrackingRepository implements TrackingRepositoryInterface {
  constructor(prismaClient?: PrismaClient);
  findByBookingUid(bookingUid: string);
}
```

**New file `packages/app-store/_lib/crm-schemas.ts`**, exporting two zod objects:
```ts
export const writeToBookingEntry;        // { value: string | boolean; fieldType: CrmFieldType; whenToWrite: WhenToWrite }
export const writeToRecordEntrySchema;   // { field: string; fieldType: CrmFieldType; value: string | boolean; whenToWrite: WhenToWrite }
```

**Existing file `packages/app-store/hubspot/zod.ts`**: `appDataSchema` gains `onBookingWriteToEventObject?: boolean` and `onBookingWriteToEventObjectFields?: Record<string, writeToBookingEntry>`.

**How the tests set up the HubSpot `CrmService`** (`packages/app-store/hubspot/lib/CrmService.ts`): they inject mocks into two new private fields, `trackingRepository` (a `PrismaTrackingRepository`, stubbing `findByBookingUid`) and `bookingRepository` (a `BookingRepository`, stubbing the existing `findBookingByUid`), and stub the existing `getAppOptions()` with `vi.spyOn`, so app options should be read through `this.getAppOptions()`. They also inject `hubspotClient` and `auth`; the only meeting-properties call their client stub provides is `hubspotClient.crm.properties.coreApi.getAll("meetings")`.
''')

    # #26217 ------------------------------------------------------------------------------------------------
    before_mocks(26217, '''
**Prisma calls the tests stub** (through `prismaMock`): `user.findUnique`, `user.findFirst`, `team.findUnique`, `verificationToken.delete`; `user.upsert` for a signup with an invite token, and `user.create` for a signup without one (in both handlers). Unique-constraint errors are instances of the mocked `Prisma.PrismaClientKnownRequestError` from `@calcom/prisma/client` (the mocked `Prisma` defines only that class, with `code` and `meta.target`).

**How the tests call the handlers:** the mocked `NextResponse.json` throws unless it is given an explicit `{ status }`. `calcomHandler`'s default export stays `usernameHandler(handler)`; the tests' `usernameHandler` mock captures the inner `handler`.
''')

    # #27088 ------------------------------------------------------------------------------------------------
    replace(27088, '**Existing file `packages/features/availability/lib/getUserAvailability.ts`**, new methods:',
            '**Existing file `packages/features/availability/lib/getUserAvailability.ts`**, new method on the existing '
            'class `UserAvailabilityService` (the tests spy on its existing `_getUserAvailability`, so the new method '
            'should call `this._getUserAvailability`):')

    mock_line(27088, 'packages/features/di/containers/BusyTimes.ts',
              '- `packages/features/di/containers/BusyTimes.ts`: `getBusyTimesService`, returning a stub with only `getStartEndDateforLimitCheck`, `getBusyTimesForLimitChecks` and `getBusyTimes`')

    # #27192 ------------------------------------------------------------------------------------------------
    before_mocks(27192, '''
**Existing file `packages/types/Calendar.d.ts`**: `CalendarEvent` gains `assignmentReason?: { category: string; details?: string | null } | null`.
''')
    mock_line(27192, 'packages/features/bookings/lib/getCalEventResponses.ts',
              '- `packages/features/bookings/lib/getCalEventResponses.ts`: `getCalEventResponses`')

    # #27208 ------------------------------------------------------------------------------------------------
    before_mocks(27208, '''
`ActiveFiltersValidator`, used above, is a new type: `(filters: ActiveFilters) => ActiveFilters`. `createActiveFiltersValidator` returns one.
''')

    # #27378 ------------------------------------------------------------------------------------------------
    before_mocks(27378, '''
**New file `packages/features/webhooks/lib/tasker/types.ts`**, exporting:
```ts
export type WebhookDeliveryResult = { taskId: string };
export interface IWebhookTasker {
  deliverWebhook(payload: WebhookTaskPayload): Promise<WebhookDeliveryResult>;
}
```
(`WebhookTaskPayload` is the existing type in `packages/features/webhooks/lib/types/webhookTask.ts`.)

**New file `packages/features/webhooks/lib/tasker/trigger/schema.ts`**: re-exports the existing `webhookTaskPayloadSchema` (from `../../types/webhookTask`) as `webhookDeliveryTaskSchema`. `WEBHOOK_DELIVERY_JOB_ID` is a string constant local to `deliver-webhook.ts`.
''')
    mock_line(27378, 'packages/features/webhooks/lib/tasker/trigger/deliver-webhook.ts',
              '- `packages/features/webhooks/lib/tasker/trigger/deliver-webhook.ts`: `deliverWebhook` (its `.trigger` method)')

    # #27405 ------------------------------------------------------------------------------------------------
    before_mocks(27405, '''
**Existing file `packages/trpc/server/routers/viewer/bookings/reportWrongAssignment.handler.ts`**: the handler's result gains `reportId: string`. It gets its translations from `getTranslation` (mocked), and the new i18n key the tests provide is `wrong_assignment_already_reported`.

**Existing file `packages/features/bookings/repositories/BookingRepository.ts`**: the booking returned by `findByUidIncludeEventTypeAndTeamAndAssignmentReason` also selects `routedFromRoutingFormReponse: { formId }`.

**Prisma client in the repository test:** `WrongAssignmentReportRepository` gets a stub client with only `wrongAssignmentReport.findUnique` and `wrongAssignmentReport.create`.
''')
    mock_line(27405, '@calcom/prisma', '- `@calcom/prisma`: `default` only (an empty object)')
    mock_line(27405, 'packages/features/bookings/repositories/WrongAssignmentReportRepository.ts',
              '- `packages/features/bookings/repositories/WrongAssignmentReportRepository.ts`: automocked; the handler tests make `new WrongAssignmentReportRepository(...)` return a stub with only `existsByBookingUid` and `createReport`')
    mock_line(27405, 'packages/features/bookings/repositories/BookingRepository.ts',
              '- `packages/features/bookings/repositories/BookingRepository.ts`: automocked; `new BookingRepository(...)` returns a stub with only `findByUidIncludeEventTypeAndTeamAndAssignmentReason`')
    mock_line(27405, 'packages/features/bookings/services/BookingAccessService.ts',
              '- `packages/features/bookings/services/BookingAccessService.ts`: automocked; `new BookingAccessService(...)` returns a stub with only `doesUserIdHaveAccessToBooking`')

    # #27428 ------------------------------------------------------------------------------------------------
    replace(27428, 'export function createBookingSheetKeydownHandler(config: BookingSheetKeyboardConfig)',
            'export function createBookingSheetKeydownHandler(config: BookingSheetKeyboardConfig): (e: KeyboardEvent) => void')
    note(27428, 'The tests mark an open overlay (dialog, popover) by giving an ancestor of the focused element (`document.activeElement`) the `data-radix-portal` attribute.')

    # #30354 ------------------------------------------------------------------------------------------------
    s = get(30354)
    s = s.replace('  isSelected?: boolean;   // new\n', '')       # generator put it on the wrong (outer) type
    # UserOptions already has ctx at base; this "change" names no new interface and only hints at the owner check
    s = re.sub(r'\*\*Existing file `packages/trpc/server/routers/viewer/availability/user\.handler\.ts`\*\*, changed signatures.*?```\n\n', '', s, flags=re.S)
    put(30354, s)
    replace(30354, 'export function getEventSegmentForDay(event: { start: Date | string; end: Date | string }, day: dayjs.Dayjs)',
            'export function getEventSegmentForDay(event: { start: Date | string; end: Date | string }, day: dayjs.Dayjs): { start: dayjs.Dayjs; end: dayjs.Dayjs } | null')
    mock_line(30354, 'packages/app-store/calendar.services.generated.ts',
              '- `packages/app-store/calendar.services.generated.ts`: `CalendarServiceMap`, with `googlecalendar` and `office365calendar` entries (each a promise of `{ default: (credential) => service }`)')
    mock_line(30354, 'packages/app-store/_utils/oauth/OAuthManager.ts',
              '- `packages/app-store/_utils/oauth/OAuthManager.ts`: `OAuthManager`; `new OAuthManager(...)` returns a stub with only `requestRaw`')
    mock_line(30354, 'packages/app-store/_utils/oauth/oAuthManagerHelper.ts',
              '- `packages/app-store/_utils/oauth/oAuthManagerHelper.ts`: `oAuthManagerHelper` (only `credentialSyncVariables`)')
    mock_line(30354, 'packages/features/di/containers/GetUserAvailability.ts',
              '- `packages/features/di/containers/GetUserAvailability.ts`: `getUserAvailabilityService`, returning a stub with only `getUserAvailabilityIncludingBusyTimesFromLimits`')
    before_mocks(30354, '''
**Existing file `apps/web/modules/bookings/types.ts`**, more changes: new `export type OverlaySocialLoginProvider = "google" | "azure-ad";` and, in `WrappedBookerPropsMain`, each entry of `calendars.connectedCalendars[].calendars` gains `isSelected?: boolean`.

**Existing file `packages/types/Calendar.d.ts`**: `EventBusyDate` gains `title?: string`; the `Calendar` interface gains an optional method `getAvailabilityWithTitles?(params: GetAvailabilityParams): Promise<EventBusyDate[]>`.

**Existing file `packages/features/bookings/lib/useCheckOverlapWithOverlay.tsx`**: the result gains `overlappingTitle` (`string | null`).

**Existing component `OverlayCalendarContinueModal`** (`apps/web/modules/bookings/components/OverlayCalendar/OverlayCalendarContinueModal.tsx`): new prop `socialLoginProviders?: OverlaySocialLoginProvider[]`, and `onContinue` becomes `(socialLoginProvider?: OverlaySocialLoginProvider) => void`. The tests find the buttons with `data-testid` `overlay-calendar-continue-button` (existing), `overlay-calendar-google-button` and `overlay-calendar-microsoft-button`.
''')
    print('specs-final rebuilt:', len(list(OUT.glob('*.md'))), 'specs')


if __name__ == '__main__':
    main()
