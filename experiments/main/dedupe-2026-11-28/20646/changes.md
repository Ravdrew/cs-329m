# Changes for #20646

## Intent
- "Retain the existing loader when there is insufficient page-type information to choose a skeleton" -> "Retain the existing loader when page-type information is insufficient to choose a skeleton" (wording).
- Dropped "and the shadow-root lookup contract in the shared interface" from the last sentence: paragraph 2 already says to find the loader and skeleton inside the element's shadow root (repetition). Last sentence is now "Support the supplied constructor dataset in integration mode."

## Brief
- Unchanged.

## Edits (fresh 'embeds', chain 'embed-core')
- Single modify note follows the new intent word for word (follows intent change).

## Word counts (JSON: words in all text values except ids/kinds/groups)
- intent.md: 206 -> 196
- brief.md: 23 -> 23
- fresh/edit.json: 206 -> 196
- chain/edit.json: 206 -> 196

## Validation
- apply-edit.mjs passes for both: 1 marked (0 new, 1 modify).

## Open questions for the intent author
- Human reviewer (intent, verdict question): the intent names EmbedElement from the spec, though the review guide says no function names in the intent. Keep the name or describe it generically? Not changed here.
- Same reviewer: the last sentence ("Support the supplied constructor dataset in integration mode") is the spec's test setup reworded, not something a developer would write. Keep it or drop it, given the spec already says it? Kept (only its repeated shadow-root clause was removed).
- "the skeleton-data callback described in the interface" points to the spec. Is that pointer intended?
