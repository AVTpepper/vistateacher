# Architecture

## Application Shape

VistaTeacher is a Next.js App Router application. Server Components render read-heavy routes; Client Components are limited to forms, optimistic interactions, Firebase listeners, uploads, charts, and browser-only SDK operations. Route Handlers form the trusted boundary for sessions, destructive changes, quotas, billing, AI, exports, moderation, and counters.

Pages compose domain components and do not own persistence logic. Product code belongs under `src/features`; shared infrastructure under `src/lib`; Zod contracts under `src/schemas`; cross-domain types under `src/types`.

## Authentication Sessions

1. The browser signs in through Firebase Authentication.
2. It sends a fresh ID token to `/api/auth/session` over HTTPS.
3. Firebase Admin verifies the token and required email state.
4. The server creates a short-lived `httpOnly`, `secure`, `sameSite=lax` session cookie.
5. Protected layouts verify the cookie and load current account status.
6. Logout clears the cookie through `/api/auth/logout`.

Client auth state improves UX but never authorizes server operations. Administration additionally requires a server-verified `platform_admin` custom claim or trusted role.

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

The Firebase MVP uses normalized fields, keyword arrays, and bounded parallel prefix queries. A service interface keeps Firestore limitations out of UI components and permits later Algolia or Typesense adoption.
