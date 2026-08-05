# Architecture

## Application Shape

VistaTeacher is a Next.js App Router application. Server Components render read-heavy routes; Client Components are limited to forms, optimistic interactions, Firebase listeners, uploads, charts, and browser-only SDK operations. Route Handlers form the trusted boundary for sessions, destructive changes, quotas, billing, AI, exports, moderation, and counters.

Pages compose domain components and do not own persistence logic. Product code belongs under `src/features`; shared infrastructure under `src/lib`; Zod contracts under `src/schemas`; cross-domain types under `src/types`.

## Authentication Sessions

1. The browser signs in through Firebase Authentication.
2. It sends a fresh ID token to `/api/auth/session` over HTTPS.
3. Firebase Admin verifies revocation, recent authentication time, and required email state.
4. The server creates a short-lived `httpOnly`, `secure`, `sameSite=lax` session cookie.
5. Protected layouts verify the cookie and load current account status.
6. Logout clears the cookie through `/api/auth/logout`.

Client auth state improves UX but never authorizes server operations. Administration additionally requires a server-verified `platform_admin` custom claim or trusted role.

Session, logout, and onboarding mutations require the configured same-origin request. Onboarding validates a bounded educator profile with Zod, then an Admin SDK transaction creates the public profile, private preferences, and Community subscription record together. Firestore rules deny direct client creation of these identity records.

## Firebase Access

The web SDK handles permitted reads, real-time listeners, authentication, and ownership-scoped images. Security rules are the final client boundary. Firebase Admin is imported only from `server-only` modules for transactions, signed downloads, notifications, moderation, and aggregates. Each Admin operation checks session, status, ownership, entitlements, validation, and rate limits because Admin bypasses rules.

## Administration

Every administrator page verifies the server session and `platform_admin` role before reading data; the mutation endpoint repeats that check and the domain service rejects non-admin actors independently. Overview reads only `platformStats/current` plus twelve recent audit entries. User, content, report, and verification readers use fixed limits and never expose private contact details or unrestricted message history.

User status, content moderation, report resolution, and verification decisions run as Firestore transactions. Each transaction writes the target changes and creates one audit record containing only the actor, action, target, bounded previous/new state, explicit reason, and server timestamp. Audit records are never updated or deleted by product code. Administrator accounts cannot suspend themselves or another platform administrator.

## Subscription Resolution

`subscriptions/{uid}` is server-owned. Effective entitlements resolve centrally from Stripe status plus any unexpired legacy temporary-access record. Payment does not set educator verification. Stripe events are signature-verified, deduplicated by event ID, and safe to retry; checkout redirects never grant access.

New temporary Plus access enrollment is retired, and the former endpoint returns HTTP 410. Legacy timestamps remain server-owned so existing access expires correctly. Checkout accepts only a monthly/yearly choice and derives customer identity, prices, and redirect URLs from trusted state. Customer Portal requires an existing Stripe customer. Webhook reconciliation writes `billingEvents/{eventId}` and the subscription in one transaction; a Stripe creation-time watermark prevents delayed events from replacing newer lifecycle state.

## AI Lesson Flow

The server verifies session/status, validates bounded source parameters, resolves plan allowances, and reserves monthly creation or refinement quota plus lesson generation state in one Admin transaction. Community receives one creation and two refinements per month; Plus retains fifty total generations. A trusted timestamp on the monthly usage record provides a cross-instance generation cooldown. The browser never receives an OpenAI credential.

OpenAI Responses structured output uses the shared Zod lesson schema. One repair attempt is allowed. Successful generation atomically updates the current lesson and creates its immutable numbered version; failed generation removes the reservation or restores the previous ready version and reverses quota. Tests inject a deterministic server-only provider and never call OpenAI.

Manual edits and duplication also create immutable versions transactionally. PDF and DOCX files are generated in memory by authenticated routes that re-check active status, ownership, and monthly export allowance; Community receives two exports per month and Plus is unlimited.

## Notifications and Analytics

Trusted operations create notifications alongside the causing action, skip self-notifications, and expose only recipient-owned read state. Clients cannot create notifications.

Normal requests do not scan activity collections. Trusted writes and reconciliation jobs maintain `platformStats/current` and `userAnalytics/{uid}`. The dashboard composes personalized recommendations through existing bounded network, resource, feed, and forum readers, while analytics reads only the educator profile, exact usage periods, subscription state, and one owner aggregate.

All educators receive basic aggregate totals. Full follower, profile-view, resource-download, and engagement series are projected only after effective Plus entitlement resolution. Recharts is isolated in a client-only dynamic bundle and is not requested for Community dashboards. Daily messaging and monthly resource/AI quota states come from exact `usage` documents rather than browser counters.

## Messaging

Conversation IDs sort the two participant UIDs, guaranteeing one one-to-one thread per educator pair. The messages page server-renders a bounded conversation list and initial history; the authenticated Firebase client listens only to the selected participant-readable message collection for real-time delivery. Older history uses an opaque timestamp and document-ID cursor.

Message sends run through Firebase Admin transactions. Each transaction verifies both active participants, both block directions, conversation membership, the effective subscription, and daily usage before creating the message, updating unread summary state, incrementing `usage/{uid}_{YYYY-MM-DD}.messages`, and creating the recipient notification. Community accounts stop at ten messages per UTC day; Plus accounts are unlimited.

Attachments use a server reservation with generated paths and exact MIME/size metadata. Storage rules accept only the matching active owner upload. The send operation verifies object metadata before consuming the reservation, while failed sends cancel the object and reservation. Direct object reads are denied; participant-authorized downloads use the server route with attachment headers.

Blocks and deterministic message reports are server-owned. Block checks run in both directions inside every send transaction. Notification creation and read controls also use trusted routes; direct document writes remain denied.

## Search

The Firebase MVP uses normalized fields, keyword arrays, and bounded parallel queries. The authenticated command interface issues an abortable request to a server search service, which groups approved educators, resources, and discussions. A service boundary keeps Firestore limitations out of UI components and permits later Algolia or Typesense adoption.

## Profiles and Settings

Public profile routes read `users/{uid}` and join effective subscription state on the server. Contact details are loaded from `userPrivate/{uid}` only for the owner or when the owner explicitly enables public sharing. Profile and settings forms submit bounded Zod contracts to same-origin route handlers; Firestore rules deny direct identity-document mutations so clients cannot bypass server validation. Profile cover uploads are bounded server-side image writes available only with effective Plus access; owners may remove an existing cover after downgrade. Account deletion records a reviewable request rather than deleting data synchronously.

Authenticated workspace pages use a fixed application shell rather than repeated page footers. The sidebar links to one in-app information hub for About, support, plan, privacy, and terms destinations. On short desktop viewports the navigation remains independently scrollable while its native scrollbar is visually suppressed; the mobile drawer retains normal scrolling.

## Discovery and Network

Educator discovery performs a bounded active-profile read and applies normalized name, subject, grade, location, and verification filters on the server. Suggestions rank unfollowed educators by shared subjects, grade level, and city without fabricating recommendation data.

Follow IDs are deterministic (`followerUid_followingUid`). A same-origin authenticated route runs follow and unfollow through an Admin SDK transaction that reads both profiles, the relationship, and server-owned subscription state before writing. The transaction enforces active status, prevents self-follow and duplicates, resolves the effective plan centrally, applies the Community connection limit, and updates both profile counters atomically.

## Feed

The home feed renders its first bounded page in a Server Component and loads later pages through an authenticated route. Opaque cursors contain only a validated timestamp and document ID. All, Following, and Saved views share the same post DTO; Following scans a bounded newest-post window against server-owned relationships, while Saved pages the viewer's private bookmark records.

Post, question, and resource-share payloads use one Zod contract. Same-origin route handlers create content and run likes, bookmarks, comments, reports, counter updates, and owner deletion through Firebase Admin. Deterministic like, bookmark, and report IDs make retries idempotent. Client interactions update immediately and restore prior state when a trusted mutation fails.

Feed images use generated owner-scoped Storage paths. The browser validates image type and size before upload, and Storage rules independently require an active matching owner, an approved image MIME type, and a 10 MB maximum. Feed document writes remain server-only so uploaded URLs cannot be used to alter moderation or counters directly.

## Resources

Resource uploads use a reservation and finalization workflow. A same-origin route validates bounded metadata, resolves the effective plan, checks monthly usage, increments quota, and creates an `uploading` resource with a generated owner-scoped Storage path in one transaction. Storage rules require that exact reservation, owner, path, MIME type, and byte size. The server verifies object metadata before activating and approving the resource and incrementing the profile resource count. Cancellation reverses an unfinished reservation.

The library performs a bounded approved-resource read and provides search, type and subject filters, sorting, and grid/list views. Detail reads join author, viewer entitlement, and deterministic review records. Review transactions maintain rating total, count, and average without trusting browser aggregates.

Resource objects deny direct reads. The download route re-resolves account status and plan, enforces Plus-only access, reads the private object through Admin Storage, increments the download counter, and returns an attachment with MIME sniffing disabled. Owner deletion removes metadata, reviews, private objects, and the profile counter; unfinished deletion also restores quota.

## Forum

The forum renders active category aggregates and the first approved discussion page in Server Components. Later pages use an authenticated route and an opaque cursor containing only the last activity timestamp and document ID. Category filtering, stable ordering, and bounded reply reads use committed compound indexes.

Thread, reply, like, report, accepted-answer, and moderation writes are server-owned. Transactions verify active users and visible targets, initialize trusted counters, update category/thread aggregates, and use deterministic reaction and report IDs for idempotency. Only a thread owner or platform administrator can lock or delete a discussion; pinning is platform-administrator-only. Thread owners and administrators can select one approved reply as the accepted answer.

Deletion reconciles category counts and removes replies, reactions, and reports. Accepted-answer deletion clears the solved state atomically. Client interactions refresh from trusted DTOs after mutations and optimistic helpful votes restore server state after failure.
