# Mapping for 24465

| Intent clause | fresh | chain |
|---|---|---|
| Make the cache-serving decision a boolean on every normal path | legacy-calendar-cache | calendar-cache |
| In CacheService's `getShouldServeCache`, keep explicit `true`/`false` as highest priority | legacy-calendar-cache | calendar-cache |
| No override and no team ID: return `false` rather than `undefined` | legacy-calendar-cache | calendar-cache |
| Consult team's `calendar-cache-serve` feature only with a team ID and no boolean override | legacy-calendar-cache | calendar-cache |
| Follow that result into the calendar availability code that selects cached or live provider | google-calendar-app | google-calendar-integration |
| Treat any falsy `shouldServeCache` as bypass, replacing the strict `=== false` comparison | google-calendar-app | google-calendar-integration |
| A truthy decision retains the existing cached path | google-calendar-app | google-calendar-integration |
| Keep focused; preserve provider calls, cache population, date/calendar selection inputs | google-calendar-app | google-calendar-integration |

Both components hold `packages/features/calendar-cache/lib/getShouldServeCache.ts`, so the CacheService clauses go there.

## Unsure

- The intent does not name a file for "the calendar availability code that selects the cached or live provider". I put
  it on the Google Calendar node because that is the only component whose description says it chooses between the
  cache and a live free/busy call (chain: "getFreeBusyResult consults CalendarCache before calling Google freebusy").
  The fresh graph gives less support: the Google node mentions freebusy but has no edge to legacy-calendar-cache.
- No edges were added or changed. The feature-flag lookup and the cache-to-availability handoff only change their
  conditions; they are not new connections. Neither graph has a cache-to-feature-flags edge to mark.
- Nothing was left unplaced.
