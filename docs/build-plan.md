# VistaTeacher Build Plan

This checklist tracks code and tests that exist in the repository. A task is marked complete only after its implementation and relevant verification pass.

## Phase 0 - Foundation

- [x] Initialize Next.js App Router with strict TypeScript, Tailwind CSS, ESLint, and pnpm.
- [x] Add the VistaTeacher design tokens and local font configuration.
- [x] Add application dependencies and reusable UI foundations.
- [x] Configure formatting, unit tests, browser tests, and continuous integration.
- [x] Add Firebase client, Admin SDK, emulators, rules, indexes, and typed model foundations.
- [x] Add environment validation and a documented environment template.
- [x] Add architecture, data model, security, and decision documentation.
- [x] Pass lint, type checking, unit tests, rules tests, browser smoke tests, and a production build.

## Phase 1 - Marketing, Authentication, and Onboarding

- [x] Build accessible marketing, pricing, legal, help, and authentication routes.
- [x] Implement Firebase email/password and Google authentication.
- [x] Implement secure server session cookies and protected routes.
- [x] Implement verified-email gating and password reset.
- [x] Implement persisted, Zod-validated educator onboarding.

## Phase 2 - Application Shell and Profiles

- [x] Build responsive desktop and mobile platform navigation.
- [x] Build public profiles, profile editing, and settings.
- [x] Add privacy-aware contact details and account deletion requests.
- [x] Add the grouped search service and command interface.

## Phase 3 - Discover and Network

- [x] Build normalized educator discovery and filters.
- [x] Implement transactional follow and unfollow operations.
- [x] Enforce connection entitlements on the server.
- [x] Build followers, following, and suggestions views.

## Phase 4 - Feed

- [x] Implement paginated posts, questions, and resource shares.
- [x] Implement image uploads, likes, comments, bookmarks, and reports.
- [x] Implement following and saved feeds.
- [x] Add optimistic interactions with rollback and ownership checks.

## Phase 5 - Resources

- [x] Implement validated Storage uploads and resource metadata.
- [x] Build searchable grid, list, detail, rating, and review experiences.
- [x] Enforce upload and download entitlements on the server.
- [x] Implement safe downloads, counters, moderation, and cleanup.

## Phase 6 - Forum

- [x] Build categories, paginated threads, replies, likes, and reports.
- [x] Implement solved answers and accepted replies.
- [x] Implement owner and administrator moderation controls.

## Phase 7 - Messaging and Notifications

- [x] Implement deterministic one-to-one conversations and real-time messages.
- [x] Enforce daily message limits transactionally.
- [x] Implement attachments, blocks, reports, read state, and pagination.
- [x] Implement trusted notification creation and read controls.

## Phase 8 - AI Lesson Builder

- [x] Implement server-only OpenAI structured generation and one repair attempt.
- [x] Enforce status, rate, entitlement, and monthly quota checks.
- [x] Persist lessons and version history transactionally.
- [x] Implement editing, regeneration, duplication, PDF, and DOCX exports.

## Phase 9 - Dashboard and Analytics

- [x] Build the personalized dashboard and recommendations.
- [x] Build basic and Plus analytics from aggregate documents.
- [x] Add lazy Recharts visualizations and quota/subscription states.

## Phase 10 - Billing

- [x] Retire temporary Plus access enrollment while preserving legacy expiry state.
- [x] Implement Stripe Checkout and Customer Portal routes.
- [x] Implement verified, idempotent webhook reconciliation.
- [x] Implement pricing and billing lifecycle states.

## Phase 11 - Administration

- [x] Protect all administrator routes and operations server-side.
- [x] Build aggregate overview, users, content, reports, and verification views.
- [x] Implement moderation actions and immutable audit logs.

## Phase 12 - Hardening and Release

- [x] Complete Firestore and Storage rule coverage.
- [x] Complete required Playwright workflows against emulators.
- [x] Audit accessibility, responsiveness, performance, and SEO.
- [x] Verify App Hosting deployment configuration and documentation.
- [x] Pass the complete locked-install CI pipeline.

## Release Gates

- [x] `pnpm install --frozen-lockfile`
- [x] `pnpm lint`
- [x] `pnpm typecheck`
- [x] `pnpm test`
- [x] `pnpm test:rules`
- [x] `pnpm test:e2e`
- [x] `pnpm build`
