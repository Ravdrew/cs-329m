# Feedback for #19997

## Independent check (a second AI compared both edits with the intent)
Verdict: minor
Both edits carry the whole intent with no added rules, and their content is identical apart from the payment node and edge ids. Several requirements are repeated across entries, and the booker-facing price is placed only on the payment node.

- [repeated] both e-hnb-payment: Threading the parameters appears three times: on the payment node ("handlePayment takes `bookingFields` and `locale`"), on handle-new-booking ("Thread `bookingFields` and `locale` into `handlePayment`"), and on e-hnb-payment ("Pass `bookingFields` and `locale` to `handlePayment`").
- [repeated] both e-hnb-payment: "prices are resolved from the event configuration rather than amounts supplied by the booker" repeats the payment node's "Resolve prices from the event configuration rather than accepting amounts supplied by the booker".
- [repeated] both e-collect-apps / e-payment-stripe: The payment-service edge (e-collect-apps in fresh, e-payment-stripe in chain) repeats the payment node's "Combine the add-on amount with the base event price before invoking the existing payment service, keeping the amount consistent across payment creation, card-collection behavior" and "use the payment integration's existing currency units consistently".
- [repeated] both form-builder: "Fields without prices should retain their existing behavior" is on both form-builder and the payment node (payment-collection in fresh, payment-lib in chain).
- [misplaced] both payment-collection / payment-lib: Small doubt: the requirement that the amount stay consistent with "the price shown to the booker" is only on the server payment node, but both graphs have a Booker UI [booker-ui] component where that price is shown. No entry touches booker-ui.

## Human reviewer comments
- brief: verdict ok
- chain: verdict ok
- fresh: verdict ok
- intent: verdict ok
