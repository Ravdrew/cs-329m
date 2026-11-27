# Mapping for PR 26039

| Intent clause | fresh | chain |
|---|---|---|
| Add an opt-in mapping from booking data to HubSpot Meeting properties at meeting creation. | modify `crm-integrations` | modify `crm-integrations-family` |
| Store the enable switch and field mappings in the HubSpot app configuration | modify `crm-integrations` | modify `crm-integrations-family` |
| ...using the shared CRM enums and schemas | `crm-shared-enums-schemas` (new node), `e-crm-uses-crm-enums-schemas`, plus `crm-integrations` note | same ids, plus `crm-integrations-family` note |
| expose them in the app card through the split WriteToObjectSettings types, utilities, and UI | modify `crm-integrations`; `crm-shared-enums-schemas` note | modify `crm-integrations-family`; `crm-shared-enums-schemas` note |
| Keep the existing meeting creation fields and organizer information intact when mappings are absent or disabled. | modify `crm-integrations` | modify `crm-integrations-family` |
| In CrmService, read configuration through `getAppOptions` and fetch the available Meeting properties from HubSpot before building the extra property payload. | modify `crm-integrations` | modify `crm-integrations-family` |
| Skip configured properties that do not exist on the Meeting object. | modify `crm-integrations` | modify `crm-integrations-family` |
| Resolve each configured value by its declared type and source (literal text, booking-field placeholders, UTM placeholders, booleans, phone values, booking dates). | modify `crm-integrations` | modify `crm-integrations-family` |
| Support placeholders within surrounding text as well as a whole-value placeholder; define a consistent empty-value behavior when booking data is unavailable. | modify `crm-integrations` | modify `crm-integrations-family` |
| Use the injected tracking repository for UTM data keyed by booking UID | `tracking-repository` (new node), `e-crm-reads-tracking` | same ids |
| ...and the booking repository for booking creation time. | `e-crm-reads-booking-created` -> `booking-model` | `e-crm-reads-booking-created` -> `model-booking` |
| Convert dates and other typed values to the representation expected by the existing HubSpot integration before merging the mapped properties into the create request. | modify `crm-integrations` | modify `crm-integrations-family` |
| Respect the configured write policy | modify `crm-integrations` | modify `crm-integrations-family` |
| keep missing optional tracking or form answers from corrupting the ordinary meeting payload. | modify `crm-integrations`; `e-crm-reads-tracking` | modify `crm-integrations-family`; `e-crm-reads-tracking` |

## Could not place / unsure

- Fresh graph has no HubSpot files; `crm-integrations` ("CRM integrations (Salesforce ...)") lists only Salesforce files. I put the HubSpot work on it rather than adding a HubSpot node. Chain's `crm-integrations-family` does include `packages/app-store/hubspot/`.
- The intent calls the CRM enums/schemas "shared" but does not say they are new. No component covers `packages/app-store/_lib/`, so I added a node in both arms, with files taken from spec.md.
- The tracking repository has no existing component, so I added a node with the files spec.md names.
- Neither graph has a WriteToObjectSettings component. I placed it on the CRM integrations node (the HubSpot app card).
- Booking repository: in fresh, `BookingRepository.ts` belongs to `booking-model`. In chain, `packages/features/bookings/repositories/` belongs to `handle-new-booking`. I pointed the chain edge at `model-booking`, because what gets read is booking data.
- There is no HubSpot external node, so the call that fetches Meeting properties from HubSpot stays inside the CRM node's note.
