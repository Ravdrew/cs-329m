# Mapping for PR 19997

| Intent clause | fresh | chain |
|---|---|---|
| Extend booking fields so supported questions can contribute an additional charge to the event's configured price | form-builder | form-builder |
| Store optional prices on fields and on individual options | form-builder | form-builder |
| Use field-type capabilities to distinguish quantity or checkbox pricing from option pricing | form-builder (also mentioned in e-payment-uses-booking-fields) | form-builder (also mentioned in e-payment-uses-booking-fields) |
| In the form builder, expose price controls only when pricing is enabled and the field type supports it | form-builder | form-builder |
| Keep each option's price attached to its stable value when options are added or edited | form-builder | form-builder |
| Show prices in the payment currency | form-builder | form-builder |
| Compute the payable amount on the server from saved booking-field definitions and submitted responses | payment-collection, e-payment-uses-booking-fields (new) | payment-lib, e-payment-uses-booking-fields (new) |
| Number = quantity x price; checked checkbox = fee; single-choice = selected option fee; multi-choice = sum of selected option fees | payment-collection | payment-lib |
| Unanswered optional fields and unselected options contribute nothing | payment-collection | payment-lib |
| Resolve prices from event configuration, not booker-supplied amounts | payment-collection, e-hnb-payment | payment-lib, e-hnb-payment |
| Use the payment integration's existing currency units consistently | payment-collection, e-collect-apps | payment-lib, e-payment-stripe |
| Thread `bookingFields` and `locale` into `handlePayment` and its callers | payment-collection, handle-new-booking, e-hnb-payment | payment-lib, handle-new-booking, e-hnb-payment |
| Combine add-on amount with base event price before invoking the existing payment service | payment-collection, e-collect-apps | payment-lib, e-payment-stripe |
| Keep amount consistent across payment creation, card collection, and price shown to the booker | payment-collection (contains the payment page), e-collect-apps | payment-lib, e-payment-stripe |
| Preserve dry-run, unsupported-payment-service behavior and post-payment flow | payment-collection | payment-lib |
| Fields without prices retain existing behavior | form-builder, payment-collection | form-builder, payment-lib |

## Unsure / not placed

- "Pricing is enabled" and "payment currency" must reach the FormBuilder from the event type editor, but neither graph has an edge from the event type UI to the form builder and the intent does not name that caller, so no event type UI node or edge is marked.
- "Its callers": handleNewBooking is the only caller of handlePayment in either graph, so it is the only caller marked.
- "Price shown to the booker": in fresh the payment page lives in payment-collection; chain has no payment page component, so it stays on the payment-lib note. Booker UI is not marked.
- The new edge payment -> form-builder (uses) is inferred from handlePayment reading the booking-field definitions.
