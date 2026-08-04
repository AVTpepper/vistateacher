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

Session, logout, and onboarding mutations require the configured same-origin request. Onboarding validates a bounded educator profile with Zod, then an Admin SDK transaction creates the public profile, private preferences, and Free subscription record together. Firestore rules deny direct client creation of these identity records.

## Firebase Access

The web SDK handles permitted reads, real-time listeners, authentication, and ownership-scoped images. Security rules are the final client boundary. Firebase Admin is imported only from `server-only` modules for transactions, signed downloads, notifications, moderation, and aggregates. Each Admin operation checks session, status, ownership, entitlements, validation, and rate limits because Admin bypasses rules.

## Subscription Resolution

`subscriptions/{uid}` is server-owned. Effective entitlements resolve centrally from Stripe status plus the VistaTeacher no-card trial. Payment does not set educator verification. Stripe events are signature-verified, deduplicated by event ID, and safe to retry; checkout redirects never grant access.

## AI Lesson Flow

The server verifies session/status, validates input, resolves Plus access, checks rate/quota, and calls OpenAI. Structured JSON is Zod-validated. One repair may be attempted; malformed output is neither saved nor charged. A transaction persists the lesson/version and increments usage after valid output exists. Tests inject a deterministic server-only provider.

## Notifications and Analytics

Trusted operations create notifications alongside the causing action, skip self-notifications, and expose only recipient-owned read state. Clients cannot create notifications.

Normal requests do not scan activity collections. Trusted writes and reconciliation jobs maintain `platformStats/current` and `userAnalytics/{uid}`. Dashboard charts read these bounded aggregates.

## Search

The Firebase MVP uses normalized fields, keyword arrays, and bounded parallel queries. The authenticated command interface issues an abortable request to a server search service, which groups approved educators, resources, and discussions. A service boundary keeps Firestore limitations out of UI components and permits later Algolia or Typesense adoption.

## Profiles and Settings

Public profile routes read `users/{uid}` and join subscription state on the server. Contact details are loaded from `userPrivate/{uid}` only for the owner or when the owner explicitly enables public sharing. Profile and settings forms submit bounded Zod contracts to same-origin route handlers; Firestore rules deny direct identity-document mutations so clients cannot bypass server validation. Account deletion records a reviewable request rather than deleting data synchronously.

## Discovery and Network

Educator discovery performs a bounded active-profile read and applies normalized name, subject, grade, location, and verification filters on the server. Suggestions rank unfollowed educators by shared subjects, grade level, and city without fabricating recommendation data.

Follow IDs are deterministic (`followerUid_followingUid`). A same-origin authenticated route runs follow and unfollow through an Admin SDK transaction that reads both profiles, the relationship, and server-owned subscription state before writing. The transaction enforces active status, prevents self-follow and duplicates, resolves the effective plan centrally, applies the Free connection limit, and updates both profile counters atomically.

## Feed

The home feed renders its first bounded page in a Server Component and loads later pages through an authenticated route. Opaque cursors contain only a validated timestamp and document ID. All, Following, and Saved views share the same post DTO; Following scans a bounded newest-post window against server-owned relationships, while Saved pages the viewer's private bookmark records.

Post, question, and resource-share payloads use one Zod contract. Same-origin route handlers create content and run likes, bookmarks, comments, reports, counter updates, and owner deletion through Firebase Admin. Deterministic like, bookmark, and report IDs make retries idempotent. Client interactions update immediately and restore prior state when a trusted mutation fails.

Feed images use generated owner-scoped Storage paths. The browser validates image type and size before upload, and Storage rules independently require an active matching owner, an approved image MIME type, and a 10 MB maximum. Feed document writes remain server-only so uploaded URLs cannot be used to alter moderation or counters directly.
