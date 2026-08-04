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
- Teacher verification is an independent administrator decision, never a payment benefit.

## Rules and Secrets

Rules are deny-by-default. Public profile and private settings mutations are server-only, while private documents are owner/admin readable. Validated route handlers exclude role, status, verification, counters, and arbitrary deletion metadata from educator-controlled input. Conversation reads require membership; lessons are owner-only; admin collections require claims.

Initial profile, private preference, and subscription documents are created only by the transactional server onboarding endpoint. Clients cannot create partial identity records directly.

Clients cannot create or delete follow documents or alter connection counters. The follow endpoint re-verifies active account state, trusted origin, target state, existing relationship, effective plan, and current count inside the transaction. Free accounts stop at five following connections; Plus accounts use the centralized unlimited entitlement.

Clients cannot write posts, comments, reactions, bookmarks, or reports directly. Feed routes validate bounded payloads, re-verify active sessions, derive every owner ID, initialize moderation and counters, and enforce post visibility or ownership inside Admin transactions. Like, bookmark, comment, report, and delete requests never accept counters or owner fields from the browser.

Resource reservations validate taxonomy, access tier, file name, MIME, and size before allocating quota. Storage accepts an upload only when an `uploading` Firestore reservation matches the authenticated owner, complete object path, MIME, and exact byte size. Clients cannot write resource or review documents, choose counters, read private objects, or bypass the monthly Free upload limit.

Firebase Admin credentials, Stripe secrets, webhook secrets, and OpenAI keys remain in `server-only` modules and managed App Hosting secrets. Logs redact tokens, keys, contacts, private lesson content, and unnecessary payment payloads.

## Uploads

Generated object names prevent path injection. Feed images use direct authenticated uploads only under `posts/{uid}/{generatedId}/{generatedName}`; browser checks are repeated by Storage rules that enforce active ownership, image MIME type, and a 10 MB limit. The server validates MIME, extension, size, ownership, and resource type for trusted workflows. Unsafe documents download with `Content-Disposition: attachment` and are never executed inline. Paid resources, messages, and verification evidence deny direct Storage reads; trusted endpoints provide short-lived authorized downloads. Deletion workflows clean orphaned files idempotently.

Resource files are returned with `Content-Disposition: attachment`, `Cache-Control: private, no-store`, and `X-Content-Type-Options: nosniff`. The route verifies active account state and effective plan before reading bytes; Free accounts cannot download Plus-only files unless they own them. Failed or canceled uploads delete any reserved object, and owner deletion removes every file under the generated resource prefix.

## Billing, Quotas, and Rate Limits

The browser cannot set plans or trials. Stripe signatures and event IDs provide authenticity and idempotency. Quota checks and increments use transactions; failed operations do not consume quota. Production rate limits use a persistent store, never instance memory.

## Privacy and Moderation

Private contact data is fetched only when the viewer owns the profile or the educator has explicitly opted into public contact sharing. Account deletion requires an exact confirmation and records a server timestamp for review. Blocking is checked across follows, messaging, discovery, and notifications. Reports disclose only necessary target context. Reported-message review is narrowly scoped and creates an audit log.

## Operations

- Use least-privilege service accounts and rotate exposed credentials.
- Add App Check after test/emulator bypasses are documented.
- Configure CSP, HSTS, referrer, framing, and MIME-sniffing headers before release.
- Alert on webhook failures, elevated admin actions, trial abuse, and quota anomalies.
- Review rules/index changes and run emulator tests before deployment.
- Establish retention, legal hold, export, and permanent deletion procedures.
