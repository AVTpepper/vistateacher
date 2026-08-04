# Data Model

Firestore writes use server timestamps. Public documents contain no payment secrets, private contact data, or raw moderation evidence. Core compound indexes live in `firestore.indexes.json`; every new compound query adds its index in the same change.

## Identity and Billing

| Path                   | Ownership and purpose                  | Important fields                                                                                       |
| ---------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `users/{uid}`          | Server-created public educator profile | normalized identity/location, professional fields, role, verification, counters, status, timestamps    |
| `userPrivate/{uid}`    | Server-written; owner/admin reads      | email, contact details, privacy/notification settings, payment reference, moderation/deletion metadata |
| `subscriptions/{uid}`  | Server-owned; owner reads safe state   | plan/status, Stripe IDs, interval/end/cancellation, VistaTeacher trial state                           |
| `usage/{uid}_{period}` | Server-owned monthly or daily counters | messages, resource uploads, AI lessons, period, timestamp                                              |

## Community

| Path                                        | Ownership and purpose         | Important fields                                                                        |
| ------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------- |
| `follows/{followerUid_followingUid}`        | Server transaction            | `followerUid`, `followingUid`, `createdAt`                                              |
| `posts/{postId}`                            | Server-written author content | type/content/images/tags/resource, visibility/moderation, trusted counters, timestamps  |
| `posts/{postId}/comments/{commentId}`       | Server-written comment        | author, content, moderation, timestamps                                                 |
| `postLikes/{postId_uid}`                    | Server-owned user reaction    | post, user, timestamp                                                                   |
| `postBookmarks/{uid_postId}`                | Server-owned private save     | post, user, timestamp                                                                   |
| `resources/{resourceId}`                    | Server-owned upload workflow  | taxonomy/access, private Storage path, safe file metadata, status, counters, moderation |
| `resourceReviews/{resourceId_uid}`          | Server-owned review upsert    | resource, author, rating, review, timestamps                                            |
| `forumCategories/{categoryId}`              | Server/admin taxonomy         | name, description, icon/color, order, active, thread/post counters                      |
| `forumThreads/{threadId}`                   | Server-owned discussion       | category/content/tags, pin/lock/solved, accepted reply, counters/activity               |
| `forumThreads/{threadId}/replies/{replyId}` | Server-owned reply            | author, content, accepted state, trusted counters, moderation, timestamps               |
| `forumLikes/{target_uid}`                   | Server-owned reaction         | thread/reply target, user, timestamp                                                    |

## Messaging and Lessons

| Path                                      | Ownership and purpose             | Important fields                                                                        |
| ----------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------- |
| `conversations/{sortedUid_sortedUid}`     | Participant-readable/server-write | participant IDs, last preview/sender/time, per-user unread counts, timestamps           |
| `conversations/{id}/messages/{messageId}` | Participant-readable/server-write | sender, bounded text, consumed attachment metadata, read members, moderation, timestamp |
| `messageAttachments/{attachmentId}`       | Server-owned upload reservation   | owner/conversation, generated path, exact file metadata, reservation status, timestamp  |
| `users/{uid}/notifications/{id}`          | Recipient-readable/server-write   | type, actor/entity, safe message/link, read state, timestamp                            |
| `blocks/{blockerUid_blockedUid}`          | Private blocker/server            | blocker, blocked user, timestamp                                                        |
| `lessons/{lessonId}`                      | Owner-only by default             | structured lesson, source parameters, current version, timestamps                       |
| `lessons/{lessonId}/versions/{versionId}` | Owner-only immutable snapshot     | structured content, source, timestamp                                                   |

## Moderation and Aggregates

| Path                        | Ownership and purpose               | Important fields                                                  |
| --------------------------- | ----------------------------------- | ----------------------------------------------------------------- |
| `reports/{reportId}`        | Server-created; admins review       | reporter/target, reason, status, assignee, resolution, timestamps |
| `verificationRequests/{id}` | Applicant creates; admins decide    | user, evidence path, status, reviewer/reason, timestamps          |
| `auditLogs/{id}`            | Server append-only                  | admin, action/target, previous/new state, reason, timestamp       |
| `platformStats/current`     | Server aggregate                    | user/content/subscription/moderation totals and trends            |
| `userAnalytics/{uid}`       | Server aggregate; owner/admin reads | engagement, growth, views, resources, forum, AI series            |

Soft deletion precedes permanent deletion. Retention policies must minimize private/payment data while preserving legally required billing and audit records. Administrators do not receive blanket message access; reported-message review is narrowly scoped and audited.

Public educator discovery uses bounded `searchKeywords` arrays derived by trusted profile mutations. Private contact fields never enter public profile documents or search indexes. A deletion request is stored under `userPrivate/{uid}.accountDeletion.requestedAt`; a later reviewed workflow performs soft and permanent deletion.

Follow transactions create or remove the deterministic relationship document and update `users/{followerUid}.followingCount` plus `users/{followingUid}.followerCount` atomically. Relationship queries use the single-field `followerUid` and `followingUid` indexes; no client may write these records or counters directly.

Feed writes are server-only. Post creation initializes moderation and counters and increments the author's `postCount` in one transaction. Like and bookmark IDs are deterministic for idempotent retries; comments update `commentCount` transactionally. Report IDs combine target and reporter to prevent duplicate reports. Owner deletion decrements `postCount` and removes comments, reactions, bookmarks, and report records. Feed and bookmark pagination order by server timestamp plus document ID for stable opaque cursors.

Resource reservations store `status: uploading`, the generated `filePath`, expected MIME and size, `usagePeriod`, and pending moderation state while incrementing `usage/{uid}_{YYYY-MM}.resourceUploads`. Finalization verifies the private object and changes status to `active` with approved moderation. Reviews use `{resourceId}_{uid}` IDs and transactionally maintain `ratingTotal`, `ratingCount`, and `ratingAverage`. Resource objects remain private in Storage and are served only by the entitlement-checked attachment route.

Forum threads page by `lastActivityAt` plus document ID. Thread creation increments category thread and post counts; each reply increments the thread reply count and category post count. Like IDs encode target and user. Forum report IDs encode target and reporter. Accepting an answer sets `forumThreads.acceptedReplyId` and the matching reply's `accepted` flag in one transaction. Deletion reverses aggregates and removes child replies, reactions, and reports.

One-to-one conversation IDs sort both participant UIDs. Message transactions verify both active profiles and block directions, enforce `usage/{uid}_{YYYY-MM-DD}.messages`, create a recipient notification, and update the conversation preview plus unread counts atomically. Message history pages by `createdAt` and document ID. Attachment reservations are consumed only after Storage metadata verification; failed sends delete unconsumed reservations and objects. Message report IDs combine message and reporter to prevent duplicate reports.

AI generation reserves `usage/{uid}_{YYYY-MM}.aiLessons` and lesson generation state in one transaction. The usage document also stores the trusted last-generation timestamp used for cross-instance rate enforcement. A successful model response writes validated current content and `versions/v{number}` atomically. Failed generation restores the previous ready lesson and decrements quota. Manual edits and duplication create immutable version snapshots without consuming AI quota.

Dashboard requests read `userAnalytics/{uid}` as a bounded aggregate containing basic totals and at most 24 points per trend series. Free responses exclude trend series; Plus responses may include follower growth, profile views, resource downloads, and engagement. Quota cards join exact daily or monthly `usage` records with centrally resolved plan limits. Recommendation inputs remain in their owning bounded domain readers and are not copied into analytics documents.
