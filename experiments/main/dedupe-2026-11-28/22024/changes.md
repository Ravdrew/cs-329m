# Changes for #22024

## Intent
- Unchanged: no restated sentences; wording already tight.

## Brief
- Unchanged.

## Edits (fresh and chain; now identical apart from ids handle-new-booking/booking-fields, email-manager/email-sms-notifications, workflows-boundary/workflow-reminders)
- fresh: the booker-form part moved from form-builder to a new booker-ui modify entry, matching chain and the graph's owner of the booker form (misplaced, AI check). form-builder keeps the personal-events option and the editor control.
- booker-ui (both): cut to "Carry the phone-versus-email requirement choice into the booker form."; the confirm-without-email clause and the email-confirmation path are now only on the server-validation entry (repetition, AI check).
- handle-new-booking (fresh) / booking-fields (chain): unchanged; now the single home of "confirmed without asking ... email" and "Keep the email-confirmation path working".
- SMS entries and e-sms-dispatch: unchanged (no repetition).

## Word counts (JSON: words in all text values except ids/kinds/groups)
- intent.md: 198 -> 198
- brief.md: 22 -> 22
- fresh/edit.json: 248 -> 212
- chain/edit.json: 248 -> 212

## Validation
- apply-edit.mjs passes for both: 5 marked (1 new, 4 modify).

## Open questions for the intent author
- The human reviewer's fresh comment reads only "[email-manager] " with no text. Was something meant to follow (for example about the email-manager node holding SMSManager)? Nothing was changed for it.
