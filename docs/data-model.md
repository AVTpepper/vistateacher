# Data Model

Firestore writes use server timestamps. Public documents contain no payment secrets, private contact data, or raw moderation evidence. Core compound indexes live in `firestore.indexes.json`; every new compound query adds its index in the same change.

## Identity and Billing

| Path                   | Ownership and purpose                  | Important fields                                                                                       |
| ---------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `users/{uid}`          | Public/semi-public educator profile    | normalized identity/location, professional fields, role, verification, counters, status, timestamps    |
| `userPrivate/{uid}`    | Owner and trusted admin/server         | email, contact details, privacy/notification settings, payment reference, moderation/deletion metadata |
| `subscriptions/{uid}`  | Server-owned; owner reads safe state   | plan/status, Stripe IDs, interval/end/cancellation, VistaTeacher trial state                           |
| `usage/{uid}_{period}` | Server-owned monthly or daily counters | messages, uploads, AI lessons, period, timestamp                                                       |

## Community

| Path                                        | Ownership and purpose        | Important fields                                                                        |
| ------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------- |
| `follows/{followerUid_followingUid}`        | Server transaction           | follower, following, timestamp                                                          |
| `posts/{postId}`                            | Author content               | type/content/images/tags, visibility/moderation, counters, timestamps                   |
| `posts/{postId}/comments/{commentId}`       | Comment author               | author, content, moderation, timestamps                                                 |
| `postLikes/{postId_uid}`                    | User reaction                | post, user, timestamp                                                                   |
| `postBookmarks/{uid_postId}`                | Private save                 | post, user, timestamp                                                                   |
| `resources/{resourceId}`                    | Trusted upload workflow      | taxonomy/access, Storage path, safe file metadata, rating/download counters, moderation |
| `resourceReviews/{resourceId_uid}`          | One review per user/resource | author, rating, review, timestamps                                                      |
| `forumCategories/{categoryId}`              | Server/admin taxonomy        | name, description, icon, order, active                                                  |
| `forumThreads/{threadId}`                   | Author discussion            | category/content/tags, pin/lock/solved, accepted reply, counters/activity               |
| `forumThreads/{threadId}/replies/{replyId}` | Reply author                 | author, content, likes, moderation, timestamps                                          |

## Messaging and Lessons

| Path                                      | Ownership and purpose         | Important fields                                                  |
| ----------------------------------------- | ----------------------------- | ----------------------------------------------------------------- |
| `conversations/{sortedUid_sortedUid}`     | Participants                  | participants/summary, last preview/time, timestamps               |
| `conversations/{id}/messages/{messageId}` | Trusted send endpoint         | sender, text/attachment, read state, moderation, timestamp        |
| `users/{uid}/notifications/{id}`          | Recipient                     | type, actor/entity, safe message, read, timestamp                 |
| `blocks/{blockerUid_blockedUid}`          | Private blocker/server        | blocker, blocked user, timestamp                                  |
| `lessons/{lessonId}`                      | Owner-only by default         | structured lesson, source parameters, current version, timestamps |
| `lessons/{lessonId}/versions/{versionId}` | Owner-only immutable snapshot | structured content, source, timestamp                             |

## Moderation and Aggregates

| Path                        | Ownership and purpose               | Important fields                                                  |
| --------------------------- | ----------------------------------- | ----------------------------------------------------------------- |
| `reports/{reportId}`        | Reporter creates; admins review     | reporter/target, reason, status, assignee, resolution, timestamps |
| `verificationRequests/{id}` | Applicant creates; admins decide    | user, evidence path, status, reviewer/reason, timestamps          |
| `auditLogs/{id}`            | Server append-only                  | admin, action/target, previous/new state, reason, timestamp       |
| `platformStats/current`     | Server aggregate                    | user/content/subscription/moderation totals and trends            |
| `userAnalytics/{uid}`       | Server aggregate; owner/admin reads | engagement, growth, views, resources, forum, AI series            |

Soft deletion precedes permanent deletion. Retention policies must minimize private/payment data while preserving legally required billing and audit records. Administrators do not receive blanket message access; reported-message review is narrowly scoped and audited.
