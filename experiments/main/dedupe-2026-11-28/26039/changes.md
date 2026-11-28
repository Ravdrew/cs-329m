# Changes for #26039

## Intent
- "Support placeholders within surrounding text as well as a value consisting entirely of one placeholder" -> "inside surrounding text and as the whole value" (wording).
- "the representation expected by the existing HubSpot integration" -> "the representation the existing HubSpot integration expects" (wording).
- Everything else already tight; kept.

## Brief
- Unchanged (already short, no repetition).

## Edits (fresh and chain, identical apart from ids crm-integrations/crm-integrations-family and booking-model/model-booking)
- Modify note: follows the new intent wording; still holds every requirement except the repository sentence, which lives on the new tracking node and booking edge.
- crm-shared-enums-schemas: files list emptied, since the intent names no paths (added detail, AI check). Note cut to "New shared module." because the config/WriteToObjectSettings use is already on the modify note (repetition).
- tracking-repository: files list emptied (added detail, AI check). "UTM data keyed by booking UID" is now only on the node note; summary shortened so it does not repeat the note (repetition).
- e-crm-uses-crm-enums-schemas: note cut to a short purpose phrase; config/WriteToObjectSettings already on modify note (repetition, AI check).
- e-crm-reads-tracking: dropped the UID/injection restatement and "missing optional tracking must not corrupt..." which is on the modify note (repetition, AI check).
- e-crm-reads-booking-created: wording tightened.

## Word counts (JSON: words in all text values except ids/kinds/groups)
- intent.md: 208 -> 202
- brief.md: 22 -> 22
- fresh/edit.json: 327 -> 247
- chain/edit.json: 327 -> 247

## Validation
- apply-edit.mjs passes for both: 6 marked (5 new, 1 modify).

## Open questions for the intent author
- None from reviewers (all verdicts ok). The intent still leaves the empty-value behavior and the write-policy semantics open, on purpose.
