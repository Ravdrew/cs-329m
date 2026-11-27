# Mapping for PR 27378

| Intent clause | fresh | chain |
|---|---|---|
| Route webhook delivery through a WebhookTasker using the same environment-based dispatch pattern as the existing taskers | webhook-tasker (new) | webhook-tasker (new) |
| Define the shared `IWebhookTasker` contract around the existing WebhookTaskPayload and `{ taskId }` result | webhook-tasker | webhook-tasker |
| Supply synchronous and Trigger.dev implementations to the Tasker base class | webhook-tasker; e-webhook-tasker-base | webhook-tasker; e-webhook-tasker-base |
| Use `ENABLE_ASYNC_TASKER` through that common mechanism (production enqueues; no-async environment delivers immediately) | webhook-tasker; e-webhook-tasker-base | webhook-tasker; e-webhook-tasker-base |
| WebhookSyncTasker calls injected WebhookTaskConsumer directly, awaits, returns identifier in same result shape | webhook-tasker; e-webhook-tasker-consumer | webhook-tasker; e-webhook-tasker-consumer |
| WebhookTriggerTasker dynamically loads and triggers the webhook job, returns queued task's identifier | webhook-tasker | webhook-tasker |
| Trigger.dev job validates same payload schema, resolves consumer via existing DI container, executes same delivery | webhook-tasker; e-webhook-tasker-consumer | webhook-tasker; e-webhook-tasker-consumer |
| Keep payload construction and actual delivery semantics shared across both modes | webhook-tasker; webhook-dispatch | webhook-tasker; webhook-dispatch |
| Producer service depends on WebhookTasker instead of InternalTasker and passes existing payloads through `deliverWebhook` | webhook-dispatch; e-producer-webhook-tasker | webhook-dispatch; e-producer-webhook-tasker |
| Add the corresponding DI tokens and modules using the project's binding pattern | webhook-tasker | webhook-dispatch |
| Wire the Trigger.dev job configuration and schema re-export | webhook-tasker | webhook-tasker |
| Preserve the tasker framework's established dispatch and error behavior (no separate fallback policy, no double delivery) | webhook-dispatch; e-webhook-tasker-base | webhook-dispatch; e-webhook-tasker-base |

## Unplaced
None.

## Unsure
- DI tokens/modules: chain's webhook-dispatch already owns `packages/features/di/webhooks/*`, so the note lands there; fresh has no DI component, so it lands on the new webhook-tasker node.
- Tasker base class: chain's tasker node owns `packages/lib/tasker/Tasker.ts`; fresh's tasker node does not list it, but it is the closest component, so the `uses` edge targets `tasker` in both.
- No Trigger.dev external node exists in either graph; none was added because the intent does not say one is new. Trigger.dev job files are listed on webhook-tasker; `config.ts` is not listed because neither the intent nor the spec names it.
- The existing edge webhook-dispatch -> tasker (sendOrSchedulePayload) was left unchanged; the intent does not mention it.
