# Draft spec clarifications (ambiguous convention tests)

**Rejected 2026-11-26 (Jo); not applied to specs-final.** They state asserted values or call arguments, which the 2026-11-02 interface rule keeps out of specs; see TEST-FAIRNESS.md. Kept for the record. One block per PR; identical sentences are merged.

## #19997

- A field or option `price` is in whole currency units (for example dollars), while `handlePayment` keeps the payment amount in the smallest unit (cents), so a price of 15 adds 1500 to the amount.  
  _Tests: 4_

## #20646

- `generateDataAttributes` writes each key as a kebab-case `data-` attribute (`testKey` and `TestKey` both become `data-test-key`).  
  _Tests: 3_

## #24124

- mergeBookingResponsesWithEventData sets responses.title from event.summary, responses.notes from event.description and responses.location to {value, label, optionValue} all equal to event.location, each only when the event field is non-empty.  
  _Tests: 3_
- When booking.responses is not a plain object, extractBookingResponses builds a fallback in which missing email and notes become "" and location is omitted unless booking.location is non-empty.  
  _Tests: 2_

## #24324

- findAllReportedBookings passes skip/take to prisma findMany, selects only the BookingReportSummary fields, and orders by createdAt descending.  
  _Tests: 1_

## #24880

- calculateEventLayouts defaults are baseWidthPercent 80, offsetStepPercent 8, baseZIndex 60 and safetyMarginPercent 0.5; event i in an overlap group gets left = i*step, width = baseWidthPercent and zIndex = baseZIndex + i.  
  _Tests: 5_
- The default safetyMarginPercent is 0.5, and every layout must satisfy leftOffsetPercent + widthPercent <= 100 - safetyMarginPercent.  
  _Tests: 2_

## #25313

- Token endpoint errors return RFC 6749 §5.2 bodies {error: code}: 400 invalid_request for an unsupported grant_type, a missing code_verifier or an access code stored without a code_challenge; 400 invalid_grant for an unknown/expired code, a redirect_uri mismatch or a failed PKCE check; 401 invalid_client for an unknown client or a missing/wrong client_secret.  
  _Tests: 9_
- verifyCodeChallenge treats an omitted method as 'S256'.  
  _Tests: 1_

## #27088

- Compute the limit window with getStartEndDateforLimitCheck(dateFrom.toISOString(), dateTo.toISOString(), bookingLimits, durationLimits), passing both parsed limits (null when absent) as separate arguments.  
  _Tests: 3_

## #27378

- After deliverWebhook resolves, queueTask logs debug 'Webhook delivery task queued' with { operationId, taskId } where taskId is the returned result.taskId.  
  _Tests: 1_

## #27428

- isEditableTarget detects contenteditable elements by checking `element.contentEditable === "true"` (the jsdom test environment does not implement isContentEditable or reflect the contenteditable attribute).  
  _Tests: 2_

## #30354

- getOverlayDateRange returns { dateFrom, dateTo } as dayjs .format() strings (start of the selected day, end of the later of selectedDate and lastVisibleDate), or { dateFrom: null, dateTo: null } when there is no selected date.  
  _Tests: 4_
- getAvailabilityWithTitles requests the same calendarView URL as getAvailability with `subject` appended to the select list: `$select=showAs,start,end,subject&$top=999`.  
  _Tests: 1_
- When a busy time starts and ends on different days, overlappingTimeStart/End use the dayjs format "MMM D, HH:mm"; otherwise "HH:mm".  
  _Tests: 1_
- A segment's end on a day the event runs past is the next day's midnight (dayStart.add(1, 'day')), not 23:59; an event ending exactly at midnight does not appear on the following day.  
  _Tests: 2_
