# Architecture Decisions

## ADR-001: App Router server boundaries

**Accepted.** Server Components render authenticated reads and Route Handlers own privileged operations. Client Components cover browser interaction and listeners. This avoids a monolithic context and keeps secrets out of bundles.

## ADR-002: Firebase session cookies

**Accepted.** Firebase client authentication exchanges an ID token for an HTTP-only session cookie. Server layouts verify it with Firebase Admin; client state is not authorization.

## ADR-003: Server-owned entitlements

**Accepted.** One entitlement map defines Community/Plus behavior. Effective plan derives from the server subscription and any unexpired legacy temporary-access record on each privileged request. New temporary-access enrollment is retired. Stripe redirects never grant access, and payment never grants verification.

## ADR-004: Trusted invariant-heavy writes

**Accepted.** Follows, resource finalization/downloads, messages, AI, notifications, counters, billing, and moderation use server endpoints and transactions. Direct writes remain only where rules fully express the invariant.

## ADR-005: Firestore MVP search behind an interface

**Accepted.** Search uses normalized prefix fields and keyword arrays with bounded parallel queries. A service boundary permits later Algolia or Typesense adoption.

## ADR-006: On-demand server exports

**Accepted.** PDF and DOCX exports are generated after ownership/entitlement checks and returned as attachments rather than public stored files.

## ADR-007: Tailwind CSS 4 CSS-first tokens

**Accepted.** Tokens and mappings live in `src/app/globals.css`. A legacy JavaScript Tailwind config is unnecessary unless future compatibility requires it.

## ADR-008: Mock providers only behind server interfaces

**Accepted.** Tests can inject deterministic provider fixtures; production rejects mock configuration. Runtime pages never depend on mock database or authentication modules.
