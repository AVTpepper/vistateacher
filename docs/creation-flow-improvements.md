# Creation-flow improvements

## Recovery behavior

Feed posts, discussion drafts, resource details, new messages, lesson parameters, and lesson edits save recovery copies in the current browser. Keys include the authenticated account and, where applicable, the lesson, recipient, or incomplete resource. A different account does not automatically restore another account's work.

Recovery writes happen during edit events, so immediately refreshing the page does not depend on a debounce timer. The UI describes the copy as saved **on this device**. Existing explicit discussion, resource, and message draft actions continue saving to the server for use on another device.

Recovery does not publish a post or lesson, consume AI allowance, or create lesson versions. Successful publication or saving clears the relevant recovery copy. Failed requests retain it. Lesson edits based on an older version are identified before saving. Select Edit on a lesson to restore its unfinished edit.

Binary resource files are not stored in recovery copies; after a refresh, select the file again. Completed feed attachment URLs are retained. In-progress uploads cannot be recovered. If browser storage is blocked or full, editing remains available and the UI warns before page unload or link navigation.

## Compatibility

The post-create response adds an optional `post` alongside the existing `postId`. Failure to read the optional confirmed post does not turn a successful creation into an error. The feed replaces the pending item without refetching or discarding loaded pages, and deduplicates overlapping pagination results.

Onboarding requires name, professional role, education stage, subjects, and a taught language when Languages is selected. Location, organization, bio, and experience are deferred. Country and city can remain empty when editing the profile. Existing profiles need no migration.

Plan prices and allowances are unchanged. Plus AI creations and refinements share a 50-generation monthly pool. Monthly lesson allowances reset at 00:00 UTC on the first day of the next calendar month, independently of subscription renewal.

## Verification

`tests/e2e/consistent-creation.spec.ts` creates isolated accounts in the demo Firebase emulators. It covers desktop and phone layouts, keyboard and accessibility checks, failed requests, refresh recovery, short onboarding, owned-resource navigation, Community limits, the final shared Plus generation, and the connection cap.

Unit coverage verifies draft account separation, storage failures, incomplete input recovery, accessible authentication errors, retained feed pages/cursors, overlapping Saved results, and onboarding destination/plan intent. The broader existing suite also exercises attachment uploads, dialogs, billing, feed interactions, and rules.
