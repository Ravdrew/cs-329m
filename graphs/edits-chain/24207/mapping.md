# Mapping for 24207

Node ids: `api.book` / `book-event-api` (route), `flags.features` / `feature-flags`, `model.event-type` / `model-event-type`. New node in both arms: `bot-detection-service` (group `booking-core`).

| Intent clause | fresh | chain |
|---|---|---|
| Add BotID verification to `/api/book/event` before booking creation can cause side effects | api.book; e5 | book-event-api; e-bookapi-handle |
| Decision and verification logic in BotDetectionService | bot-detection-service (new) | bot-detection-service (new) |
| Feature and event-type repositories injected through its constructor | bot-detection-service; e-botdetection-flags; e-botdetection-eventtype | same ids |
| Pass request headers and optional event type ID into `checkBotDetection` | e-bookapi-botdetection; bot-detection-service; api.book | e-bookapi-botdetection; bot-detection-service; book-event-api |
| Route assembles inputs and reports unsuccessful verification through its normal error handling | api.book; e-bookapi-botdetection | book-event-api; e-bookapi-botdetection |
| `NEXT_PUBLIC_VERCEL_USE_BOTID_IN_BOOKER` and team `booker-botid` setting determine enablement | bot-detection-service; e-botdetection-flags | bot-detection-service; e-botdetection-flags |
| Resolve team through `getTeamIdByEventTypeId` and the feature repository | e-botdetection-eventtype; e-botdetection-flags; flags.features | e-botdetection-eventtype; e-botdetection-flags; feature-flags |
| Make missing event type / personal event behavior explicit without assuming a team | bot-detection-service; e-botdetection-eventtype | same ids |
| Add env setting to the example configuration | bot-detection-service | bot-detection-service |
| Register team feature with default off | flags.features | feature-flags |
| When enabled, call `checkBotId` with request context, reject bot, let human continue to existing booking handler | bot-detection-service; e5 | bot-detection-service; e-bookapi-handle |
| Disabled rollout must not change ordinary booking behavior | api.book; e5; bot-detection-service | book-event-api; e-bookapi-handle; bot-detection-service |
| Distinguish bot verdict from verification-service failure in logging and error handling, explicit failure policy | bot-detection-service | bot-detection-service |
| Preserve Turnstile, rate limiting, session handling, booking metadata | api.book | book-event-api |

## Unplaced / unsure

- Neither graph has a component for the event-type repository (`packages/lib/server/repository/eventTypeRepository.ts`). I put `getTeamIdByEventTypeId` on a new read edge from the service to the EventType model and did not add a repository node, because the intent does not say the repository is new.
- `.env.example` belongs to no component, so the note for it is on the new service node.
- No node was added for BotID (`botid/server`), since neither graph has a matching external component (chain has no external group). `checkBotId` is in the service node's note instead.
