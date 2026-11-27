# Mapping for PR 20646

All of the intent concerns the embed SDK. In each graph, one component holds every embed-core file, including `Inline/inlineHtml.ts`, `ModalBox/ModalBox.ts`, `types.ts` and `utils.ts`: `embeds` in fresh and `embed-core` in chain. So both edits are one `modify` entry, and its note carries the intent word for word.

| Intent clause | fresh | chain |
|---|---|---|
| Shared EmbedElement base class for inline and modal elements (same loading, layout, theme lifecycle) | modify: embeds | modify: embed-core |
| Skeleton-data callback from the interface; page type, layout and theme derived from the embed configuration | modify: embeds | modify: embed-core |
| Inline HTML factory and skeleton-data factory produce the booking-slots or booking-form placeholder for the user or team page and layout | modify: embeds | modify: embed-core |
| Keep the existing loader when page-type information is insufficient | modify: embeds | modify: embed-core |
| Pass page-type and layout through embed initialization and generated data attributes | modify: embeds | modify: embed-core |
| On connection, find the loader and skeleton in the shadow root, show the placeholder, reserve space so there is no avoidable layout jump | modify: embeds | modify: embed-core |
| Share responsive-layout and modal-height calculations through the UI utilities; update on viewport change; hide when content is ready | modify: embeds | modify: embed-core |
| Explicit light or dark preference, otherwise the system color scheme | modify: embeds | modify: embed-core |
| Stable media-query object; theme and resize listeners for connected elements; remove listeners and pending height timers on disconnect | modify: embeds | modify: embed-core |
| Constructor dataset in integration mode; shadow-root lookup contract | modify: embeds | modify: embed-core |

## Unplaced / unsure

- Nothing is unplaced.
- Unsure: EmbedElement and the UI utilities are new files (`EmbedElement.ts` and `ui-utils.ts` in spec.md), but the intent does not name those files. The existing embed component already covers the embed-core code, so I added no new nodes.
- Generating the skeleton could arguably touch the booking pages, since the placeholder imitates the booker. The intent does not say so, so I added no edge to `public-booking-pages`.
