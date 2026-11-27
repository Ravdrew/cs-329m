# Mapping: intent -> edit entries (PR 25315)

New node `credential-access-service` (group app-store) and edges `e-editlocation-credential-access`, `e-credential-access-reads-credential` have the same ids in both arms. The handler node is `bookings-trpc` (fresh) / `booking-list-query` (chain).

| Intent clause | fresh | chain |
|---|---|---|
| Centralize conferencing-credential authorization in CredentialAccessService | add_nodes: credential-access-service | add_nodes: credential-access-service |
| call `ensureAccessible` from `editLocationHandler` whenever the request supplies a credential ID | modify: bookings-trpc; add_edges: e-editlocation-credential-access | modify: booking-list-query; add_edges: e-editlocation-credential-access |
| Run the check before constructing the event manager or any external calendar update, database write, or notification | modify: bookings-trpc; e-editlocation-credential-access | modify: booking-list-query; e-editlocation-credential-access |
| Being authorized to edit a booking should not by itself make an arbitrary credential ID usable | modify: bookings-trpc | modify: booking-list-query |
| Load the credential through `CredentialRepository.findFirstByIdWithKeyAndUser` | credential-access-service; e-credential-access-reads-credential | credential-access-service; e-credential-access-reads-credential |
| evaluate access using the authenticated user's ID and the booking owner's ID | credential-access-service | credential-access-service |
| Cover direct ownership and team or organization relationship credentials | credential-access-service | credential-access-service |
| Use `UserRepository.getUserOrganizationAndTeams` for accepted memberships/org context, not unaccepted invitations or unrelated teams | credential-access-service | credential-access-service |
| Keep editor / booking owner / credential owner distinction explicit, including a missing booking owner | credential-access-service | credential-access-service |
| Reject a missing credential or non-granting relationship before returning to the handler | credential-access-service; modify handler; both new edges (missing credential) | same |
| Successful result simply means the existing location-update flow may continue | credential-access-service; e-editlocation-credential-access | same |
| Optional Prisma client for DI, normal client as default | credential-access-service | credential-access-service |
| Keep location conversion, connected-app update, booking reference updates, notifications in current flow after success | modify: bookings-trpc | modify: booking-list-query |

## Unplaced / unsure

- Neither graph has a component for `UserRepository` or for User/Membership/Team models, so `UserRepository.getUserOrganizationAndTeams` is carried only in the new node's note; no edge was added for it.
- `CredentialRepository` is not listed in any component's files in either graph; I placed the read on an edge to `model-credential` (Credential model) rather than adding a repository node, since the intent does not say it is new.
- Group for the new node (app-store in both) is a judgment call.
