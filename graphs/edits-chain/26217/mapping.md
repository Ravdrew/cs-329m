# Mapping for PR 26217

| Intent clause | fresh | chain |
|---|---|---|
| Handle an invitation for an existing account before account creation or consuming the invitation | signup | signup |
| Same decision in hosted and self-hosted handlers: validate token, determine invited email, check for existing account | signup | signup |
| Return explicit HTTP 409 identifying USER_ALREADY_EXISTS so client can send the person through login | signup | signup |
| Keep invitation usable by the existing-account flow; preserve normal signup for new invited user and no-token signup | signup | signup |
| Concurrent duplicate creation via existing Prisma unique-constraint error path, distinguishing the account conflict from unrelated errors | signup | signup |
| Don't turn every server error into an existing-user redirect; no billing/membership side effects after rejected signup | signup | signup |
| Extract signup request into fetchSignup with supplied discriminated result type | signup-fetch (new) | signup-fetch (new) |
| Pass signup fields and optional verification token through existing request contract; parse responses consistently | signup-fetch, e-signupfetch-signup | signup-fetch, e-signupfetch-signup |
| Represent invalid server responses using the shared error code | signup-fetch | signup-fetch |
| Two result helpers so the UI can recognize existing user / checkout-session continuation without duplicating parsing | signup-fetch; UI use in signup | signup-fetch; UI use in signup |
| Show translated explanation before redirecting existing invitee to login; preserve checkout path for other outcomes | signup | signup |

## Unsure / not placed

- Neither graph has a separate signup page/UI component. Chain's `signup` includes `apps/web/app/(use-page-wrapper)/signup/page.tsx`; fresh's `signup` lists only the API and handlers. The UI clauses were put on `signup` in both arms rather than adding a page node in fresh.
- No user model, billing or membership component exists in either graph, so the Prisma constraint and the billing/membership clauses stay on `signup`.
- No edge was added from the signup UI to `signup-fetch`, because fresh has no UI component to start it from. Both arms leave it out so they stay the same.
