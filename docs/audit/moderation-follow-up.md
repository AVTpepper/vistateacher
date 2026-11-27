# Community moderation implementation plan

Prepared 25 November 2026 from a source audit. This document is a plan, not a
record of implemented fixes or passing checks. No tests, builds, or emulators
were run for this follow-up. Line references describe the audited source and
will move as implementation proceeds.

## Recommended policy

Publish immediately and retain moderation as an independent, durable decision.
An owner may edit, regenerate, restore, withdraw, and republish their material;
those actions must never clear a moderator's rejection. Only an administrator
can change an existing rejected resource back to approved.

Use `resources/{resourceId}` as the canonical moderation record for a resource.
An interactive lesson uses `resources/lesson_{lessonId}`. A separately published
DOCX from a lesson or worksheet is an independent resource with its own resource
ID, moderation, and removal lifecycle. It must not depend on the later visibility
or existence of the private original.

The public resource predicate is `exists && status === "active" &&
moderationStatus === "approved"`. For an interactive lesson, also require its
linked lesson to exist, contain valid content, have `visibility === "published"`,
and belong to the resource author. Retain the existing active-owner requirement
of shared lesson delivery. Do not return an unmoderated published lesson when
its resource is missing; authenticated backfill can establish the record first.
Retain private owner access to their saved lesson and resource detail so a
takedown does not destroy their work. Return the moderation state to the owner
and explain that an edit or republish does not restore community visibility.

Public activity posts are derived announcements. Their visibility is the
intersection of their own approved moderation state and the current visibility
of their canonical source. Their own rejected state remains meaningful for
legacy decisions and must survive publisher updates. Map sources as follows:

| Activity kind        | Canonical source                                                        | Required visibility                                             |
| -------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------- |
| `lesson-published`   | `resources/lesson_{activityEntityId}` plus `lessons/{activityEntityId}` | Public interactive lesson predicate above                       |
| `resource-published` | `resources/{activityEntityId}`                                          | Public resource predicate above                                 |
| `forum-thread`       | `forumThreads/{activityEntityId}`                                       | Existing public thread predicate, including approved moderation |

Resolve this mapping from trusted stored kind and ID, not from the activity's
`href`, label, or title. A missing, malformed, mismatched, deleted, draft,
pending, or rejected source makes the announcement invisible. Ordinary authored
posts remain independently moderated; a post mentioning/linking a resource is
not automatically the same moderation entity. Any embedded resource preview
must nevertheless obey the resource predicate.

Do not add account-wide suspension behavior incidentally. Keep existing account
write checks and existing shared-lesson owner checks. If suspension should hide
all historical posts/resources, implement that as an explicit consistent policy
across those destinations and their derived announcements.

## Why validate canonical sources on reads

Recommended minimal approach: validate the canonical source whenever an activity
can be delivered, and make resource/lesson readers use the same predicates.
Admin rejection then needs to update only the canonical record and its audit
log atomically. It need not enumerate or rewrite every derived announcement.
This also handles preexisting stale activities, missed cleanup, deletion, and
unpublication without a migration being the authorization boundary.

Merely propagating rejection to one activity in the admin transaction is
insufficient: legacy activity IDs can survive, authors currently overwrite the
activity on republish, and direct download/shared-lesson readers bypass those
posts. A mirrored activity update may improve query efficiency later, but must
not replace the canonical check. Author operations that maintain metadata and
their canonical resource should continue to do so in one transaction.

Create small shared predicates/resolvers, with a pure predicate layer usable by
tests and a server batch/transaction reader. Avoid a circular dependency between
the existing feed, lesson, resource, and forum server modules. Read all required
snapshots before the first transaction write.

## Required write fences

| Entry point and current evidence                                                                                                                    | Required implementation                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/lessons/server.ts:140` `lessonResourceData`, especially lines 164-165                                                                      | Separate owner-editable metadata/publication status from moderation. Do not include unconditional approved moderation in the reusable metadata object. Initialize a newly created public resource as approved; preserve every existing valid moderation value. Treat malformed/missing existing moderation as unavailable until an explicit migration/admin decision rather than silently approving it.                                                                         |
| `src/lib/lessons/server.ts:170` `ensurePublishedLessonResources`, lines 220-265                                                                     | Skip an existing active resource regardless of moderation, or refresh metadata without changing moderation. Activate a nonactive resource only while its lesson is still published, retaining rejection/pending. Increment only for an absent/nonactive-to-active transition. Never count active/rejected as a new resource. Preserve the backfill marker and idempotent transaction check.                                                                                     |
| `src/lib/lessons/server.ts:781` generation completion, lines 834-856                                                                                | Keep the existing job/attempt/version/active-user fences. Read current resource moderation in the completion transaction and preserve it. An admin rejection during provider work must win. Update public metadata only if the current lesson remains published; do not create an approved activity for a rejected resource.                                                                                                                                                    |
| `src/lib/lessons/server.ts:1261` `updateLesson`, lines 1332-1375; restoration delegates at line 1430                                                | Preserve moderation on save, restore, publish, and unpublish. Unpublish changes `status` to draft but must not reset rejected to pending. Republishing may activate status, but remains hidden if rejected. Continue to check owner, active account, generation lock, and expected version.                                                                                                                                                                                     |
| `src/lib/feed/server.ts:88` `writePublicActivity`, lines 95-119                                                                                     | Split initial creation from metadata refresh using an existing snapshot read by the caller. Initialize counters, moderation, and createdAt only when absent. Existing writes may update title/label/href/tags/updatedAt but must preserve moderation, reportCount, counters, createdAt, and any other stored state. Do not replace the full document. All existing callers in lesson backfill/save, resource finalization, and forum creation must follow the revised contract. |
| `src/lib/resources/server.ts:250` reservation, lines 278-300; cancellation at lines 679-689                                                         | A first upload begins uploading/pending. When completing or retrying an existing post-derived draft, preserve rejected moderation through reserve/cancel cycles. Cancellation must not replace rejected with pending. Rejecting a draft must not be evadable by attaching its first file. Keep generated-publication receipts and ownership/intent fences intact.                                                                                                               |
| `src/lib/resources/server.ts:527` `finalizeResourceUpload`, lines 583-624                                                                           | Read current moderation in the finalization transaction. Normal first completion may change initial pending to approved for immediate publication; an intervening rejected decision must remain rejected. It may finish as active/rejected with no public announcement, preserving completed private owner work and the current status-based count contract. The generated active replay at lines 602-604 must remain idempotent and must not reset moderation or counters.     |
| `src/lib/resources/server.ts:1055` `updateResource`                                                                                                 | Already preserves moderation; retain that property. Refresh any derived activity metadata without resetting activity state or reapproving the resource.                                                                                                                                                                                                                                                                                                                         |
| `src/lib/admin/server.ts:346` `content.moderate`                                                                                                    | Resolve an activity target to its canonical resource/thread inside the transaction before moderation. Validate source identity; write the canonical moderation and audit log atomically. Record canonical target type/ID and, when relevant, the requested activity ID for traceability. Direct resource moderation must not alter lesson visibility, erase owner content, or change resourceCount. Ordinary posts remain directly moderated.                                   |
| `src/lib/resources/server.ts:1171` `deleteResource`; `src/lib/lessons/server.ts:1484` `deleteLesson`; `src/lib/forum/server.ts:897` thread deletion | Keep current atomic source/resource/activity removal and status-based decrements. Canonical read checks cover any remaining orphan activity. Preserve generated-resource receipts so retry cannot resurrect a deleted publication. Do not reuse deletion to implement rejection.                                                                                                                                                                                                |

If an already rejected activity is refreshed while its canonical source is
approved, it stays rejected. Admin approval of a resource does not silently clear
an independent legacy activity rejection. An admin may explicitly approve that
activity as a separate decision if needed; provide a distinguishable action,
because new activity moderation should normally target the underlying material.

## Required read and interaction fences

| Surface and current evidence                                                                                                    | Required implementation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/lessons/server.ts:385` `getSharedLesson`, lines 390-405                                                                | For a nonowner, read the canonical resource and require the complete public interactive lesson predicate. Keep the safe nonowner source projection at lines 410-419 and omit versions. Owner lesson editing/export remains private and available after rejection.                                                                                                                                                                                                                                                           |
| `src/lib/resources/server.ts:776` `listResources`; line 855 `listOwnedResources`; line 903 `getResourceDetail`                  | Retain active+approved checks for community lists; additionally validate linked lesson visibility for interactive resources. Nonowner detail must use the same predicate. Separate private management from public listing: show hidden/rejected owned resources with their state in a management view instead of making them disappear from the owner's inventory.                                                                                                                                                          |
| `src/lib/resources/server.ts:1089` `downloadResource`, particularly lines 1102 and 1123                                         | Require public visibility for nonowners both before Storage work and in the final transaction before returning bytes or incrementing usage/downloadCount. Read the latest resource and any canonical linked data transactionally at the final gate. Preserve intentional owner download access to completed hidden material, with explicit status/ownership handling. Rejection/deletion during download must prevent delivery and counters/notifications. Never return previously fetched bytes after a failed final gate. |
| `src/lib/resources/server.ts:981` `reviewResource`, line 994                                                                    | Require the public resource predicate transactionally before changing ratings or sending notifications. Keep own-review and active-actor restrictions. Existing review removal can remain an owner cleanup action even when the resource is hidden.                                                                                                                                                                                                                                                                         |
| `src/lib/feed/server.ts:203` `hydratePosts`; `getPost` at line 286; feed/saved at line 310                                      | Batch-read activity sources and filter using the mapping above. A rejected source must be hidden from community/following/saved feeds and direct activity-post detail, including when the activity author is the viewer. Private resource/lesson management is the owner access path. Do not apply an owner bypass to a derived public announcement.                                                                                                                                                                        |
| `src/lib/feed/server.ts:394` profile posts                                                                                      | Activities are currently excluded. Keep that exclusion; apply the source predicate if profile activity is introduced.                                                                                                                                                                                                                                                                                                                                                                                                       |
| `src/lib/feed/server.ts:563` `assertVisiblePost`; interactions at lines 579, 633, 664, 690, 754, 807, 885                       | A stale client must not interact/report/comment through an activity whose source became hidden. Resolve canonical visibility inside transactions where used. Activity likes/comments/shares remain unsupported; do not accidentally enable them while changing report routing. Protect direct comment retrieval/update consistently with its parent.                                                                                                                                                                        |
| `src/app/(platform)/resources/[resourceId]/page.tsx:19` `generateMetadata`                                                      | It currently reads a resource title without its visibility gate. Return a generic title for unavailable/nonpublic material, or use the same authenticated visibility-aware loader as the page. A hidden title must not leak through metadata on an otherwise 404 page.                                                                                                                                                                                                                                                      |
| `src/lib/teaching-exports/server.ts:242` `getTeachingExport`, lines 252-256; `publishTeachingExport` at line 354, lines 373-377 | The current private publication availability flag checks active status only. Expose moderation separately or make the community availability flag require active+approved so owner UI does not promise a public copy after rejection. A completed publication retry must retain its resource ID/rejection and must never create a replacement. Preserve independent private Google Doc/export bytes.                                                                                                                        |

For download races, the final committed authorization check is the supported
boundary; a new rejection after that boundary cannot retract bytes already sent.
Tests should reject during Storage transfer to exercise the recheck, not assert
an impossible revocation of a completed response.

### Feed pagination and state

Filter canonical visibility before choosing the returned page and cursor.
Advance the scan cursor over all scanned documents, including hidden activities,
so a page containing only withdrawn announcements can still lead to later
visible posts. Use a bounded scan/refill loop and return a continuation when the
scan budget is exhausted. Do not emit a cursor based only on the last visible
post when hidden records were scanned after it, and do not claim the feed is
exhausted simply because hydration filtered every candidate. Apply this to
community, following, and saved views. Preserve document ID tie-breaking.

Existing activity Save controls are inconsistent: the menu offers Save at
`src/features/feed/post-card.tsx:478`, but `setPostBookmarked` rejects activities
at `src/lib/feed/server.ts:646`. Minimal fix: hide Save/Remove saved for activities
while keeping Report. Existing saved activity records should be safely skipped
when their source is hidden and must not break pagination. Supporting new
activity bookmarks is a separate explicit choice, requiring a canonical check.

### Direct Firebase readers

Server fences alone do not protect allowed client SDK reads. Update rules in the
same implementation, with narrowly scoped parent/source checks:

- `firestore.rules:88`: public resources currently require only approved
  moderation. Require active as well, and published linked lesson state for an
  interactive resource. Preserve owner/admin inspection access.
- `firestore.rules:68`: approved activity posts currently remain readable even
  after source takedown. Require the activity's canonical source to be public;
  give intentional admin inspection an explicit exception. Test real rule query
  behavior: cross-document rules are not a post-query filter. If a feed query
  cannot satisfy these checks, deny direct activity reads and keep public feed
  delivery server-owned rather than relaxing authorization.
- `firestore.rules:72` and `:94`: post comments and resource reviews currently
  allow any signed-in reader regardless of parent takedown. Gate their public
  reads by the visible parent, preserving intentional owner/admin inspection.
- `storage.rules:40` post attachments and `:63` resource thumbnails allow any
  active signed-in reader. Make moderation-sensitive attachment/thumbnail reads
  check the visible parent/canonical resource, or serve them through an
  authenticated server gate. Resource originals already deny direct reads at
  `storage.rules:47`; retain that boundary.

Do not broaden this into a rewrite of unrelated private lesson/worksheet,
conversation, or export access rules.

## Reporting and administrator review

Add one resource-report schema/server operation and
`POST /api/resources/[resourceId]/report`, following trusted-origin,
active-account, validated-input, and error-handling conventions of
`src/app/api/feed/[postId]/report/route.ts`. In its transaction, resolve and
validate the visible resource, reject self-reporting, deduplicate with
`reports/resource_{resourceId}_{reporterId}`, create an open canonical report,
and increment that resource's reportCount. Include reason and optional details.

Use the same operation from a Report control in
`src/features/resources/resource-detail-actions.tsx:130` and
`src/features/lessons/shared-lesson-view.tsx:7`, mapping shared lessons to
`lesson_{lessonId}` on the server. An activity Report should resolve to that
same resource/thread target (`src/lib/feed/server.ts:885`) so reporting via two
entry points does not create two independent reviews of the same material.
Maintain the existing forum report key for forum-thread activities. A normal
post's report continues to target that post. Retain a reference to the originating
activity for review context if useful, without making it the moderation target.

New reports must update pending-report accounting in the same transaction.
Currently `reportPost` and `reportForumContent` create open reports without
incrementing `platformStats/current.pendingReports`, while admin resolution
decrements it (`src/lib/admin/server.ts:361-384`). Either use one consistent
transactional counter for all report writers or replace the overview count with
an open-report query; do not add only the new resource writer to a known-partial
counter. Existing records require reconciliation if retaining the stored counter.

The reports table currently displays only type/ID and Resolve/Dismiss
(`src/features/admin/admin-views.tsx:195-240`). Add a reviewable canonical target
title/preview and Reject/Approve actions for that exact target, with an admin
inspection path for already hidden material. Do not require it to appear in the
latest 20 content records (`src/lib/admin/server.ts:197-200`). A successful report
resolution is separate from taking down material; the interface must make both
results clear and retain both audit records. Keep reason requirements.

Normalize legacy reports against activity posts when reviewing/acting on them.
Resolve the stored post kind/ID server-side; if its source is gone, show the
target as removed and permit resolving the report without recreating anything.
Do not discard existing report history when source metadata changes.

## Counts and restoration behavior

Keep the existing meaning of `users.resourceCount`: the number of resource
records with status active, independent of moderation. Save, generation,
unpublish, and delete currently use status transitions, while admin moderation
does not change the count. Changing this to an approved-public count would
require coordinated changes to every writer and a data reconciliation; it is
not necessary to close the bypasses.

- Absent/nonactive to active: increment once, including active/rejected upload
  completion if owner work is retained under that state.
- Active to draft/deleted: decrement once, including active/rejected.
- Active approved to rejected/pending, or rejection to approved: no count change.
- Metadata edit, regeneration, restoration, backfill of an already active
  record, and a finalization/publication retry: no count change.

Do not reuse resourceCount as a count of publicly visible results. A public
profile/library total must count visible resources or be labeled according to
its actual meaning. Do not reset reportCount, engagement, or original publication
time when regenerating/republishing an announcement. Unpublishing can leave a
suppressed activity record to preserve those decisions/history; canonical reads
must hide it. Actual deletion may continue its existing cleanup behavior.

Do not attempt to repair historical overcounts by decrementing on the next
rejection; the old backfill may already have overcounted some users. If exact
stored totals are needed at release, reconcile from active resources explicitly.

## Planned regression coverage

These cases are requirements for the implementation pass, not checks executed
as part of this document. Use real server functions with the in-memory Firestore
fixture for deterministic behavior, emulator rule tests for SDK boundaries, and
small browser journeys for the reporting controls. Existing starting points are
`tests/memory-firestore.ts`, `src/lib/resources/generated-publication.test.ts`,
`tests/rules/firebase.rules.test.ts`, `tests/rules/lesson-reliability.test.ts`, and
`tests/e2e/lesson-reliability.spec.ts`.

| Scenario                                                     | Required assertions                                                                                                                                                         |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First publication of a lesson/upload/generated copy          | Immediate public availability; approved canonical resource; one activity and one status-based count increment.                                                              |
| Reject published lesson, then save/restore/regenerate        | Rejection survives every path; owner retains private work; public library/detail/shared lesson/feed/direct activity URL hide it; count unchanged.                           |
| Reject lesson, unpublish, republish                          | Rejection survives both transitions; active count decreases then increases once; announcement remains hidden.                                                               |
| Backfill active/rejected and active/pending                  | No reapproval, public activity resurrection, metadata-history reset, or count increment; second call remains idempotent.                                                    |
| Backfill missing/nonactive resource of published lesson      | Creates/activates once; existing rejection survives; missing/draft/deleted lesson is not exposed.                                                                           |
| Reject upload while Storage is in flight                     | Finalization retains rejection; bytes remain owner-manageable; no public announcement; completion/retry counts once.                                                        |
| Reject post-derived draft; reserve, cancel, reserve/finalize | No draft/reservation/cancellation path clears rejection.                                                                                                                    |
| Reject resource during download transfer                     | Final transaction denies nonowner delivery; no usage, downloadCount, or download notification mutation. Owner behavior is explicitly covered.                               |
| Rejected/pending/nonactive resource review                   | No review/rating/notification mutation; active approved review still works; review owner can remove their prior review.                                                     |
| Existing rejected activity refreshed/republished             | Own rejection, reportCount, counters, createdAt, and report records preserved; metadata refresh succeeds without full replacement.                                          |
| Missing/rejected/draft source activity in all feed views     | Hidden from community/following/saved/direct detail; following visible posts remain reachable through filtered pages; no cursor loop or premature exhaustion.               |
| Source or activity is rejected after card loads              | Direct report/interaction endpoint rechecks current source; no stale-client mutation bypass.                                                                                |
| Report same resource through detail, shared lesson, activity | One canonical deduplicated report and one reportCount increment; correct target/owner/reason; repeat gets useful already-reported feedback.                                 |
| Admin reviews an old/hidden reported resource                | Can inspect and reject/approve exact canonical target even outside latest-20 content; resolution alone does not silently change content moderation.                         |
| Admin approves rejected resource                             | Public content/activity can return if publication status remains active and activity itself is approved; no new count, publication time, or duplicate post.                 |
| Removed generated publication is retried                     | Durable receipt prevents replacement; rejected completed publication retains its original ID and rejection; private Doc/export remains available.                           |
| Metadata and client SDK access to hidden material            | Generic unavailable metadata; nonowner cannot read resource/activity/reviews/comments or sensitive attachment/thumbnail through direct SDK paths; owner/admin policy holds. |
| Private-brief sentinel in source/version records             | Public shared lesson and downloadable community DOCX omit the sentinel and private history; moderation changes do not relax the safe projection.                            |
| Report counters and resolution                               | All report origins increment once; duplicate reports do not increment; resolution/dismissal decrements once; retries/concurrent resolution cannot double-decrement.         |
| Activity menu                                                | Supported Report works; unsupported Save/like/comment/share controls are absent or intentionally implemented with canonical fences.                                         |

## Implementation order

1. Add canonical predicates/source resolver and meaningful server regression
   fixtures. Preserve current resourceCount semantics in those fixtures.
2. Remove author-controlled reapproval paths and fix backfill/finalization races.
   Make activity writes preserve existing state.
3. Apply public delivery and interaction fences, including download's final
   transaction, shared lessons, metadata, and feed pagination after filtering.
4. Add canonical resource reporting and actionable admin review, normalize
   activity moderation targets, and make report accounting consistent.
5. Align direct SDK rules and owner state/availability UI. Run the focused
   regression suites and browser reporting journeys after implementation, then
   update launch documentation with actual results and any remaining limits.

This follow-up writes only this plan. Source implementation, any data
reconciliation, and execution results belong to the implementation pass.
