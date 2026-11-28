# Changes for #27378

## Intent
- Unchanged: no sentence restates another; wording already tight.

## Brief
- Unchanged.

## Edits (fresh and chain; same content, differ only in group id and where the DI tokens sentence sits: chain's webhook-dispatch already owns the webhook DI modules, so it goes on the modify note there and on the new node in fresh)
- webhook-dispatch modify note: dropped "(WebhookTaskerProducerService)" and "(WebhookTaskConsumer)", names the intent does not use (added detail); dropped "Keep payload construction ... shared across both modes", which is now only on the new node (repetition, AI check).
- webhook-tasker: files list emptied, since the intent names no paths (added detail); description dropped because it repeated the note (repetition). Note no longer carries the consumer/DI-container sentences, which are on e-webhook-tasker-consumer (repetition, AI check).
- e-producer-webhook-tasker: note cut to a short purpose phrase; the InternalTasker->WebhookTasker / `deliverWebhook` requirement is only on the modify note (repetition, AI check).
- e-webhook-tasker-consumer: keeps the consumer requirements (sync direct call + await; Trigger.dev job resolves consumer via DI container), now stated only here (repetition, AI check).
- e-webhook-tasker-base: note cut to a short purpose phrase; Tasker base class / ENABLE_ASYNC_TASKER on the node note, dispatch/error preservation on the modify note (repetition, AI check).

## Word counts (JSON: words in all text values except ids/kinds/groups)
- intent.md: 196 -> 196
- brief.md: 26 -> 26
- fresh/edit.json: 329 -> 230
- chain/edit.json: 329 -> 230

## Validation
- apply-edit.mjs passes for both: 5 marked (4 new, 1 modify).

## Open questions for the intent author
- None (no human comments).
