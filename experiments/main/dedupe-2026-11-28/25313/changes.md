# Changes for #25313

Word counts (wc -w): intent 213 -> 211; brief 25 -> 25; fresh/edit.json 419 -> 337; chain/edit.json 419 -> 337.

## Intent
- "Confidential clients must still authenticate with their secret; if they opted into PKCE, they must also satisfy its verifier check" -> "... with their secret and, if they opted into PKCE, also pass the verifier check" (wording).
- "Follow this task's requested refresh contract" -> "Follow this task's refresh contract" (wording).

## Brief
- Unchanged (already tight).

## Edits (same changes in fresh and chain; the two edits were and remain identical)
- oauth-provider modify note: dropped the "Persist the authorization request's challenge and method on its access code" sentence; it now lives once, on the writes edge (repetition; it was on the modify note, the model node and the writes edge).
- oauth-provider modify note: applied the two intent wording changes.
- model-oauth-client: dropped the challenge/method sentence from the note (repetition, now on the writes edge); dropped the description (it restated the note); files ["packages/prisma/schema.prisma"] -> [] (added detail: the intent names no path); label/summary "OAuthClient and AccessCode" -> "OAuth client and access code" (added detail: type names the intent does not use).
- pkce-util: files ["packages/lib/pkce.ts"] -> [] (added detail); summary "Shared PKCE utility around S256." -> "Shared PKCE utility." (repetition of the note).
- e-oauth-provider-pkce: note cut to a short phrase "Verifier checks on token exchange and refresh." (repetition of the modify note's verifier requirements).
- e-oauth-provider-writes-oauth-models: note is now only the persist-challenge requirement (repetition: client type and nullable secret were already on the model node).
- e-oauth-provider-reads-oauth-models: note cut to a short phrase (its "verify the original request" part is on the writes edge).
- Not changed: the feedback's [misplaced] point on fresh (an existing base-graph edge oauth-provider -> model-credential-calendar already says it reads OAuth client and access code rows). That edge is in the base graph, not the edit; the new reads edge to model-oauth-client is kept because it now carries distinct content.

## Validation
- fresh: 6 marked (5 new, 1 modify, 0 delete), OK. chain: 6 marked (5 new, 1 modify, 0 delete), OK.

## Open questions for the intent author
- None from reviewers (no human comments). Possible: the fresh base graph attributes OAuth client/access code reads to model-credential-calendar; confirm the new model node is the intended owner.
