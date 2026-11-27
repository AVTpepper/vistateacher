# Lesson workflow reliability

This supplement covers the local lesson lifecycle. It does not establish real
OpenAI quality, operating costs, deployed indexes, or production readiness.

## Saved work and versions

Saves, publishing changes, regeneration, and history restoration carry the
teacher's expected version. A stale save returns a conflict. The editor retains
its original base version and unfinished changes, loads the newer saved content,
and offers an explicit review before applying those changes to the newer version.
Closing the editor retains the private recovery draft.

The editor exposes all three activity timings. Their sum must match the lesson
duration, both in the browser and on the server. Subject, age group, and duration
corrections update the teaching brief as well as the saved lesson. Regeneration
therefore preserves those corrections. Previewing and restoring history, manual
edits, duplication, and exports use no AI actions. Restoring creates a new version
and preserves the previous versions.

New generated lessons and versions store whether they came from sample mode.
Manual edits, duplication, and restoration retain that provenance. Old records
without it cannot reliably identify their original provider. Public shared-lesson
responses omit private learner context and teacher instructions.

## Interrupted generation and retries

The browser saves an account-scoped request UUID and an immutable request brief
in the current tab's session storage before submission. Separate tabs cannot
overwrite or clear one another's active request. Reloading the same tab recovers
it; closing the tab ends client request recovery, while completed content stays
in the saved library. It reuses that request when a response is lost. Reload recovery
first checks the server; it never starts a fresh AI request automatically. A
completed request recovers the saved lesson before quota or cooldown checks.
The allowance display refreshes from server usage rather than incrementing again
when a completed response is replayed.

Private workspace requests carry the account that rendered the page. The server
rejects a changed sign-in before reading lesson data or charging an AI action.
The old tab retains its original account's recovery record, stops polling, and
offers Reload account rather than continuing under the replacement account.

Each server request has a ten-minute lease and a separate attempt identity. The
reservation owns its quota debit and the right to commit the artifact. Completion
checks the active account, expected lesson version, job, attempt, and lease.
Failure and expiry can refund a pending attempt once. A lost commit acknowledgement
is reconciled against the durable completion record before any refund. A late
worker cannot clear or overwrite a newer retry.

Explicit retries of a known failed request have their own UUID, persisted before
submission. Replaying that UUID does not reset the failed request again. Deleting
an in-flight lesson marks its request deleted, restores its allowance once, and
prevents completion from recreating it. Account cleanup removes private lesson
and worksheet request ledgers and batch manifests.

Recovery runs when the teacher revisits the workspace, opens stale work, or
checks a saved request. There is no scheduled recovery worker. Legacy abandoned
jobs without a durable request are unlocked after the same grace period; their
allowance cannot safely be refunded because the original debit period is unknown.
Refunding an app allowance does not refund tokens already billed by OpenAI.

## Batches and the saved library

A durable batch manifest records each item independently. One HTTP call advances
at most one item, keeping request duration bounded and exposing completed lessons
immediately. The original Generate N action authorizes continuation of the remaining
items. If the response is lost, recovery shows the completed items and offers
Resume. Failed items require an explicit retry; completed items keep their IDs and
are never generated again by that batch.
The child reservation also checks its current manifest claim transactionally.
A worker paused before reservation cannot charge after an expired claim has
been replaced by a retry.

The workspace sorts by updated time and document ID, loads twenty records at a
time, and checks that pagination cursors belong to the teacher. List failures
retain the selected lesson and allow another Load more attempt. Deploy the new
Firestore indexes with the application.
Deleting the current pagination boundary refreshes the list. A cursor removed
in another tab also falls back to a refreshed first page, keeping older saved
work reachable without a whole-page reload.

Selecting a saved lesson updates its URL, so reload keeps that selection. New
lesson uses an explicit new-lesson URL and retains its parameter draft. Long
saved titles preserve their beginning and truncate within the sidebar. The
shared dialog body is a named, focusable region: history previews can scroll
with Page Down and Home as well as touch or pointer input.

Generation and ledger reconciliation control the request's busy state. The
allowance display refresh runs separately with a fifteen-second bound; it cannot
keep a recovered request locked. New refreshes cancel previous ones, and account
changes or unmounting prevent their late responses from updating the display.

## Remaining issues

- Printable lesson headings are still English when generated prose uses another
  language. Real provider language adherence and teaching quality are unverified.
- A batch remains a collection of lessons, rather than an ordered curriculum unit
  with shared outcomes and assessment. Units and presentations remain later phases.
- Lesson resource synchronization can reset a rejected resource's moderation
  status, and shared lesson delivery does not yet consistently enforce that
  resource's moderation state. Editing, backfill, direct links, and feed activity
  need one moderation policy and regression coverage before launch.
- Recovery records currently have no retention policy or teacher-facing cleanup
  manager. Monitor their storage cost and define retention before large-scale use.
- Stacked transient toasts can cover the history-dialog title and desktop header
  controls. The evidence captures settled screens after normal toast dismissal;
  this does not establish that the overlap or toast close-target size is fixed.
- Batch results need distinguishable lesson titles in their saved-result links
  and clearer labels when several titles truncate to the same beginning.
- Sample provenance should remain visible alongside the selected result after
  scrolling past the page banner. Google export's community Word-copy label can
  also identify the publishing destination more clearly.
- Navigation checks exposed that existing malformed private-profile records can
  throw during strict schema parsing. Browser fixtures now supply complete
  records; production migration and graceful handling of incomplete legacy
  records still need verification. Do not interpret healthy fixtures as proof
  that legacy data is safe.

The screenshot and verification record is stored separately so its test counts,
runtime fingerprints, provider mocks, and viewport scope remain explicit.
