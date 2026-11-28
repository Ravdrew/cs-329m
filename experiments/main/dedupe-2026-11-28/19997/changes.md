# Changes for #19997

## Intent
- "contribute an additional charge to" -> "add a charge to" (wording).
- "should contribute nothing" -> "contribute nothing" (wording).
- "should retain their existing behavior" -> "keep their existing behavior" (wording).

## Brief
- Unchanged (already tight).

## Edits (both graphs, same content; payment node payment-collection / payment-lib, service edge e-collect-apps / e-payment-stripe)
- form-builder: removed "Fields without prices should retain their existing behavior" (kept once, on the payment node) (repetition); intent wording follows.
- Payment node: removed "handlePayment takes `bookingFields` and `locale`" (kept once, on e-hnb-payment) (repetition); intent wording follows.
- handle-new-booking: modify entry removed; its only content (threading the parameters) is now on e-hnb-payment, so it would be empty (repetition, feedback).
- e-hnb-payment: now carries the threading requirement once, as the intent states it; removed the repeated "prices resolved from the event configuration" clause and "along with the submitted responses" (repetition, feedback).
- Payment-service edge: cut to a short phrase; combining amounts and currency units are on the payment node (repetition, feedback).
- e-payment-uses-booking-fields: cut to a short phrase; removed "handlePayment" and the restated computation (repetition).
- Not changed: feedback's small doubt that "the price shown to the booker" could sit on booker-ui. The intent ties it to the server-computed amount, so it stays on the payment node and no entry was added.

## Word counts (edits: words in note/label/summary/description)
- intent: 218 -> 215
- brief: 26 -> 26
- fresh: 318 -> 229
- chain: 318 -> 229

## Validation
- fresh: 5 marked (1 new, 4 modify), ok. chain: 5 marked (1 new, 4 modify), ok.

## Open questions for the intent author
- None from human reviewers (all verdicts ok). Optional: should "the price shown to the booker" mean a change in the booker UI, or only that the server amount matches what is shown today?
