# Mapping for PR 25313

Both graphs have a node `oauth-provider`, and neither has OAuth models or a PKCE utility, so the two edits are identical (same ids).

| Intent clause | fresh | chain |
|---|---|---|
| Carry the client's public/confidential type through creation, authorization, token exchange, refresh | oauth-provider (modify); e-oauth-provider-writes-oauth-models; e-oauth-provider-reads-oauth-models | same |
| Add the client type with confidential as migration default; secret nullable for public clients | model-oauth-client (new) | same |
| Expose the PKCE choice in the admin client form | oauth-provider | oauth-provider |
| Persist challenge and method on the access code so token issuance can verify | model-oauth-client; oauth-provider; e-oauth-provider-writes-oauth-models; e-oauth-provider-reads-oauth-models | same |
| Shared PKCE utility around S256: URL-safe, unpadded SHA-256 challenge from verifier, compare with saved challenge | pkce-util (new) | same |
| Reject unsupported challenge methods | pkce-util | same |
| Require a challenge for public client and matching verifier on code exchange | oauth-provider; e-oauth-provider-pkce | same |
| Confidential clients still authenticate with secret; if opted into PKCE, also satisfy verifier | oauth-provider; e-oauth-provider-pkce | same |
| Keep code bound to client and redirect URI; preserve expiry and consumption | oauth-provider | same |
| Update token and refresh handlers together; refresh contract (verifier for public and PKCE confidential, secret for confidential) | oauth-provider | same |
| Preserve server-side or token-bound context to enforce the contract | oauth-provider | same |
| Supported refresh-token input locations, standard token fields, no-store headers, compatibility for non-PKCE confidential clients | oauth-provider | same |

## Unsure / not placed
- Admin client form: neither graph has a component for the admin OAuth client form UI. In chain, `oauth-provider` holds the addClient tRPC handler; in fresh, it holds neither the form nor the tRPC oAuth handlers. I put the clause on `oauth-provider` in both instead of adding a node for a component that already exists in code.
- Fresh has an existing edge `e-tasker-oauth-token` (oauth-provider -> model-credential-calendar) that describes reading OAuth client and access code rows. I left it unchanged and added a new OAuth model node plus read/write edges, as in chain.
- `files` on new nodes come from spec.md (`packages/lib/pkce.ts`, `packages/prisma/schema.prisma`).
