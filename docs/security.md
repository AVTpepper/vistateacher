# Security

## Boundaries and Authorization

The browser is untrusted. Firebase ID tokens prove authentication only after Admin verification; they do not prove current status, ownership, entitlement, quota, or admin authority. Rules constrain direct SDK traffic. Every Admin SDK operation repeats authorization and validation.

- Protected routes verify HTTP-only Firebase session cookies server-side.
- Session mutations enforce same-origin requests; session exchange requires a recently issued ID token and verified email.
- Admin access requires a verified `platform_admin` custom claim or trusted role.
- Suspended users cannot create content, follow, upload, message, or generate lessons.
- Subscription, usage, notification, message-send, aggregate, and audit writes are server-owned.
- Follow relationships and profile connection counters are server-owned and transactional.
- Feed content, interactions, reports, moderation state, and counters are server-owned.
- Resource metadata, upload quota, reviews, download counters, and object reads are server-owned.
- Forum discussions, replies, reactions, reports, moderation state, and counters are server-owned.
- Teacher verification is an independent administrator decision, never a payment benefit.

## Rules and Secrets

Rules are deny-by-default. Public profile and private settings mutations are server-only, while private documents are owner/admin readable. Validated route handlers exclude role, status, verification, counters, and arbitrary deletion metadata from educator-controlled input. Conversation reads require membership; lessons are owner-only; admin collections require claims.

Initial profile, private preference, and subscription documents are created only by the transactional server onboarding endpoint. Clients cannot create partial identity records directly. Profile cover objects are written only by the trusted cover route after active-account, effective-Plus, MIME, and size checks; Storage rules reject direct client cover writes. Cover removal remains owner-controlled.

Clients cannot create or delete follow documents or alter connection counters. The follow endpoint re-verifies active account state, trusted origin, target state, existing relationship, effective plan, and current count inside the transaction. Community accounts stop at five following connections; Plus accounts use the centralized unlimited entitlement.

Clients cannot write posts, comments, reactions, bookmarks, or reports directly. Feed routes validate bounded payloads, re-verify active sessions, derive every owner ID, initialize moderation and counters, and enforce post visibility or ownership inside Admin transactions. Like, bookmark, comment, report, and delete requests never accept counters or owner fields from the browser.

Resource reservations validate taxonomy, access tier, file name, MIME, and size before allocating quota. Storage accepts an upload only when an `uploading` Firestore reservation matches the authenticated owner, complete object path, MIME, and exact byte size. Clients cannot write resource or review documents, choose counters, read private objects, or bypass the monthly Community upload limit.

Clients cannot write forum categories, threads, replies, reactions, reports, solved state, or counters directly. Forum routes validate bounded content and trusted origins, derive actor IDs from the session, reject inactive accounts and locked discussions, and update related counters transactionally. Thread owners may lock or delete their discussions and moderate replies; only platform administrators may pin discussions. Accepted answers must belong to the selected visible thread.

Clients cannot write conversations, messages, blocks, attachment reservations, notifications, read state, or message reports directly. Message transactions derive the sender from the session, require the deterministic participant pair, check both users and both block directions, and enforce the effective-plan daily quota before any write. Recipient notifications, unread counters, and daily usage change in the same transaction as the message. Only participants can read a conversation or its messages; administrators do not receive blanket access.

Firebase Admin credentials, Stripe secrets, webhook secrets, and OpenAI keys remain in `server-only` modules and managed App Hosting secrets. Logs redact tokens, keys, contacts, private lesson content, and unnecessary payment payloads.

Clients cannot write lessons, versions, AI usage, generation status, or source parameters directly. Lesson routes derive ownership from the session and require an active account. Generation and regeneration require available plan-specific monthly creation/refinement quota plus the persistent cooldown. Structured model output is schema-validated before persistence; a failed repair releases all reserved counters. Export routes re-check ownership and monthly allowance before producing private, non-cached PDF or DOCX attachments.

Analytics documents are owner/admin-readable and server-write-only. The dashboard validates bounded aggregate shapes and resolves the effective plan before projecting full trend series. Community users receive summary totals but never Plus series. Browser-provided counts, subscription labels, and quota values are ignored; the server joins trusted profile, subscription, and exact usage documents.

Administrator pages, action routes, and domain mutations each enforce the `platform_admin` role server-side. Lists are bounded, overview metrics come from the trusted platform aggregate, and the console excludes private contacts and general message access. Moderation requires a bounded explicit reason. Target updates, pending-count changes, and append-only audit creation share one transaction; direct audit writes remain denied even to administrators. Self-suspension and suspension of other platform administrators are blocked.

## Uploads

Generated object names prevent path injection. Feed images use direct authenticated uploads only under `posts/{uid}/{generatedId}/{generatedName}`; browser checks are repeated by Storage rules that enforce active ownership, image MIME type, and a 10 MB limit. The server validates MIME, extension, size, ownership, and resource type for trusted workflows. Unsafe documents download with `Content-Disposition: attachment` and are never executed inline. Paid resources, messages, and verification evidence deny direct Storage reads; trusted endpoints provide short-lived authorized downloads. Deletion workflows clean orphaned files idempotently.

Resource files are returned with `Content-Disposition: attachment`, `Cache-Control: private, no-store`, and `X-Content-Type-Options: nosniff`. The route verifies active account state and effective plan before reading bytes; Community accounts cannot download Plus-only files unless they own them and may download five Community resources per UTC month. Owners are exempt from download quota. Failed or canceled uploads delete any reserved object, and owner deletion removes every file under the generated resource prefix.

Message attachment uploads require an active account and a matching server-owned reservation for owner, conversation, generated path, MIME, and exact byte size. Browser reads are always denied. The participant-authorized download route returns private, non-sniffable attachments; failed message sends delete unused reservations and objects.

## Billing, Quotas, and Rate Limits

The browser cannot set plans or temporary access. Stripe signatures and event IDs provide authenticity and idempotency. Quota checks and increments use transactions; failed operations do not consume quota. Community messaging is limited to ten sends per UTC day, resource downloads to five per UTC month, and AI access to one new lesson, two refinements, and two exports per UTC month. Plus messaging, resource downloads, and lesson exports are unlimited; AI generation remains limited to 50 successful generations per UTC month. Production rate limits use persistent usage records, never instance memory.

New temporary-access enrollment is disabled; the retired endpoint returns HTTP 410. Legacy start/end timestamps remain server-derived so existing access expires correctly. Checkout and Portal require an active session and trusted origin; redirect URLs, customer IDs, and price IDs are never accepted from the browser. Webhooks read the raw request body, verify the Stripe signature, persist a private event-ID receipt, and ignore events older than the subscription watermark. Configure both Plus price IDs and the webhook endpoint `/api/billing/webhook` before enabling production billing.

## Privacy and Moderation

Private contact data is fetched only when the viewer owns the profile or the educator has explicitly opted into public contact sharing. Account deletion requires an exact confirmation and records a server timestamp for review. Blocking is checked across follows, messaging, discovery, and notifications. Reports disclose only necessary target context. Reported-message review is narrowly scoped and creates an audit log.

## Operations

- Use least-privilege service accounts and rotate exposed credentials.
- Add App Check after test/emulator bypasses are documented.
- CSP, production HSTS, referrer, framing, permissions, and MIME-sniffing headers are enforced through Next.js configuration and checked by Playwright.
- Alert on webhook failures, elevated admin actions, retired-endpoint traffic, and quota anomalies.
- Review rules/index changes and run emulator tests before deployment.
- Establish retention, legal hold, export, and permanent deletion procedures.
