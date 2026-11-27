# Release Operations

## App Hosting

1. Create the Firebase App Hosting backend from the repository root and select Node.js 24.
2. Set `NEXT_PUBLIC_APP_URL` to the final HTTPS origin in both build and runtime environments.
3. Set every `NEXT_PUBLIC_FIREBASE_*` value and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` in the backend environment. App Hosting console values override the declarations in `apphosting.yaml`.
4. Create and grant the backend access to every secret referenced by `apphosting.yaml`: Firebase Admin credentials, Stripe keys/prices, and the OpenAI key. `STRIPE_MODE` is a non-secret server setting; Stripe keys remain secrets.
5. Keep `NEXT_PUBLIC_USE_FIREBASE_EMULATORS=false` in production. Enable paid generation with `AI_PROVIDER=OPENAI` only after the OpenAI activation gate below; an unaudited private preview can use clearly labelled `MOCK` output. Saved work remains usable when paid configuration is unavailable.
6. Deploy Firestore rules, Storage rules, and indexes separately before promoting the application rollout.

Create secrets with `firebase apphosting:secrets:set SECRET_NAME`. If a secret was created outside that flow, grant access with `firebase apphosting:secrets:grantaccess SECRET_NAME --backend BACKEND_ID`.

## External Services

- Enable Firebase Email/Password and Google authentication providers and add the production domain to authorized domains.
- Register `https://PRODUCTION_ORIGIN/api/billing/webhook` in the matching Stripe environment with `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`, `invoice.upcoming`, and `charge.refunded`.
- Keep `STRIPE_MODE=TEST` with an `sk_test_...` secret key, test Price IDs, and the test endpoint signing secret while validating the integration. The application rejects a mode/key mismatch.
- To accept real payments, change `STRIPE_MODE` to `LIVE` and replace all four Stripe secrets together: `STRIPE_SECRET_KEY` (`sk_live_...`), `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PLUS_MONTHLY`, and `STRIPE_PRICE_PLUS_YEARLY`. Test and live webhook signing secrets are different.
- Confirm monthly and yearly Stripe Price IDs belong to the same Stripe environment and account as `STRIPE_SECRET_KEY`.
- Never commit Stripe secret keys or expose them through `NEXT_PUBLIC_*` variables. The browser receives only a test-mode boolean and Stripe's public simulator values.
- The Stripe publishable key is intentionally public and is the only Stripe value allowed in `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`. Embedded Checkout loads Stripe.js directly and keeps payment fields inside Stripe's iframe.
- Restrict Firebase and Google Cloud service accounts to the minimum production roles.

## OpenAI pilot activation and reconciliation

The application now meters lesson and worksheet generation through `src/lib/ai/spend.ts` and `src/lib/ai/metered-responses.ts`. This is an application control, not evidence that the deployed project, provider limit, credentials, or billing baseline have been approved. No live evaluation or paid provider request was performed during this implementation.

### Budget contract

All paid admission uses one cumulative **$22 epoch**, including a **$1 evaluation subset**. The evaluation limit adds no spending capacity and does not reserve $1 against product use: ordinary generation can consume the full $22. The shared admission equation is `known + held + uncertain + imported + new hold <= $22`; evaluation calls must also satisfy the equivalent evaluation counters at $1. Amounts are integer nano-USD: $1 is `1_000_000_000` units.

Each physical call holds **$0.45** before the teacher allowance debit and durable generation job commit together. This conservatively covers the approved mini model's full context bound plus 8,000 output tokens for lessons or 16,000 for worksheets. The adapter fixes the project, standard service tier, endpoint, and `store:false`; it disables SDK retries and automatic paid output repair. An explicit teacher retry starts a new separately reserved generation attempt.

Trustworthy raw usage settles before JSON, schema, or teaching-content validation. Invalid or discarded content can therefore consume provider dollars even when the teacher's AI action is restored. A timeout, lost response, unknown usage dimension, or abandoned dispatched worker retains the full bound. Expiry, deletion, app allowance refunds, deployments, and calendar-month rollover never replenish provider money. Missing or paused financial configuration blocks new admission and dispatch; completed/pending request replay and late settlement remain independent of current paid credentials.

The reviewed source rate card is `2026-11-26-mini-standard-v1`, for `gpt-4.1-mini` and `gpt-4.1-mini-2025-04-14` only. On 2026-11-27, the [official mini model page](https://developers.openai.com/api/docs/models/gpt-4.1-mini) lists a 1,047,576-token context and standard rates of $0.40 input, $0.10 cached input, and $1.60 output per million tokens. Recheck these assumptions before activation. The [deprecation schedule](https://developers.openai.com/api/docs/deprecations) lists shutdown on January 14, 2027; source rejects new paid dispatch at `2027-01-14T00:00:00Z`. A replacement needs an explicit model, pricing, compatibility, and quality review; changing only an environment model name cannot enable it.

### Runtime configuration and current deployment gap

| Runtime setting          | Required meaning                                                                                                                                                           |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OPENAI_API_KEY`         | Managed server secret for the audited dedicated project; never a browser or organization administration key.                                                               |
| `OPENAI_PROJECT_ID`      | Actual audited `proj_...` project, set explicitly on every provider request.                                                                                               |
| `OPENAI_BUDGET_EPOCH`    | Operator-approved epoch identity matching the private budget record; not an automatically generated month key.                                                             |
| `OPENAI_LESSON_MODEL`    | Explicit reviewed model recommended for deployment. When unset, current source defaults to the allowlisted `gpt-4.1-mini`; an empty, unapproved, or retired model rejects. |
| `OPENAI_WORKSHEET_MODEL` | Optional reviewed override; when unset, source uses the lesson model and then the same mini default.                                                                       |
| `AI_PROVIDER`            | `OPENAI` selects the metered paid path; `MOCK` creates labelled demonstration content without provider spending.                                                           |

The checked-in `apphosting.yaml` currently declares the OpenAI key, lesson model, and `AI_PROVIDER=OPENAI`, but **does not declare `OPENAI_PROJECT_ID` or `OPENAI_BUDGET_EPOCH`**. Actual console overrides have not been verified. A rollout without those values rejects paid generation. Supply real reviewed runtime values through App Hosting configuration before enabling the pilot; do not invent project/epoch identifiers or insert an approval fixture. No production budget record is created by application startup or deployment.

Missing key, project, epoch, budget record, valid audit metadata, or usable budget fails closed. An unset model has the documented mini fallback rather than a missing-model error. The application never falls back to an unpriced model or a different endpoint.

### Activation gate

1. Identify one dedicated OpenAI project and its server service-account key. Verify that other keys, playgrounds, jobs, and applications cannot use this project outside the ledger. Keep any account administration credential outside the application. Record the real project and responsible operator in the access-controlled release evidence.
2. Have an authorized operator verify an enforced **$25 monthly project hard spend limit**, plus useful alerts, in that actual project. A notification-only budget is insufficient. OpenAI documents propagation lag and possible excess recorded usage, so this is a second control rather than an exact invoice guarantee. The $3 difference is headroom, not extra application allowance. [Provider spend-limit behavior](https://developers.openai.com/api/docs/guides/spend-limits).
3. Reconcile project month-to-date costs and every outstanding call before choosing starting balances. A new project may start at zero only with evidence that it is unused. For an existing project, import prior current-month costs that are not already represented by these attempts; do not add the same charges twice. Resolve whether the user's $25 means USD API usage or an all-in card charge; taxes and foreign exchange are not covered by the rate card. Firebase spending is separate.
4. Review the exact current model/rate contract, retirement date, output limits, paid-path coverage, and automated test evidence. Deploy the financial collection denials and generation indexes. `aiBudgets` and `aiSpendAttempts` must remain inaccessible to client SDKs, including client-side administrators.
5. Through a separately reviewed privileged operation, establish the private `aiBudgets/pilot` record with the real project/epoch, verified balances, and genuine audit evidence, initially paused. Match `schemaVersion`, `rateRevision`, fixed ceilings, and all ordinary/evaluation counters to the contract in `spend.ts`. `auditStatus`, `auditRef`, `auditedAt`, and `providerHardLimitNanoUsd` assert completed checks; they do not perform those checks. Do not copy test-fixture approvals or zero balances into production.
6. Set the corresponding managed secret and runtime values, deploy the reviewed application, and verify the effective configuration without printing credentials. Keep the record paused until the operator signs off on all preceding evidence. Only then enable the same audited epoch. A configuration mismatch must remain unavailable rather than being repaired by resetting balances.
7. Any subsequent paid smoke test needs an explicit bounded case and the same monetary reservation. Record its measured/uncertain outcome and reconcile it before inviting users. The emulator tests do not establish live quality, access, latency, or provider billing accuracy.

The source contains neither a production initialization command nor an automatic reconciliation/reset job. These instructions are an operating gate; they do not authorize an audit marker, provider setting change, new budget, or paid call on their own.

### Pause, reconcile, and resume the same epoch

1. Pause the existing budget with `enabled:false` through an authorized operation. Preserve its project/epoch and all attempt records so already-dispatched responses can still settle. A pause blocks new reservations and dispatch grants; it does not cancel provider work already sent.
2. Inspect all `aiSpendAttempts` for that project/epoch, including every page. Compare aggregate counters to the immutable per-call bounds and receipts. `reserved` is proven undispatched; it may release only after its domain job is terminal or the lease expires, using the existing guarded cleanup behavior. A `dispatching` marker can mean a sent call or a lost grant acknowledgement; `uncertain` retains the same full bound. Neither state can be declared free from lease expiry or the absence of a recent provider charge.
3. Match trustworthy receipts and provider project cost evidence to individual attempts. Use idempotent settlement for measured calls and retain unresolved bounds. Add only disjoint, evidenced external costs to `imported`, and the evaluation subset where attributable; never add a provider dashboard total on top of the same calls already in `known`. An unexplained difference keeps the pilot paused. Manual reconciliation repairs require their own review; no blanket counter replacement is supplied here.
4. Preserve the original teacher-allowance period for any domain refund. Do not recreate deleted account/usage records, delete financial attempts with an artifact/account, or turn an allowance refund into a monetary refund. Confirm there is sufficient headroom, a still-approved rate/model, and matching runtime configuration before resuming the **same** epoch. An exhausted epoch stays exhausted.

### Open another period only after reconciliation

There is no automatic month reset. A November epoch can remain exhausted in December. Before opening a new epoch, pause admission, stop prior workers from receiving grants, and require all old attempts to be `settled` or `released`: no unstarted/in-flight hold, `dispatching` call, or unresolved uncertainty may be dropped. Reconcile the complete prior project usage, retain the old epoch's audit snapshot and attempts, and verify the new provider billing period plus all spending already incurred in that period.

An authorized operator may then approve a new epoch at most once per UTC calendar month, with existing current-period costs imported rather than erased. Do not reopen an already-used month's capacity or reset because of a deployment, a teacher refund, or a provider alert. Keep dispatch paused while a reviewed financial update and the `OPENAI_BUDGET_EPOCH` rollout establish matching identities; enable only after balances and audit evidence are verified. If complete reconciliation is unavailable, keep the old epoch and its holds paused. Raising a provider limit or topping up credit is not a substitute for this process.

### Evaluation and remaining gates

The ledger understands `purpose:"evaluation"`, but both lesson and worksheet providers currently call `prepareResponse` with its default `"product"` purpose. There is **no live evaluation harness or paid evaluation result** in this implementation. Running comparison prompts through the ordinary UI would count as product usage and would not enforce the $1 evaluation counters.

Before live evaluation, review a synthetic-data case manifest and a harness that explicitly supplies the evaluation purpose through the same prepare/reserve/dispatch/settle path and durable fence. Execute one case at a time within the shared remaining $22 and $1 subset, with one physical call and no automatic repair; record skipped cases if uncertainty or budget stops the run. Do not send evaluations directly through the SDK or a separate unmetered key. Candidate model traffic remains disabled until its own pricing and compatibility contract is reviewed.

Current source review found one production OpenAI SDK construction and one `responses.create` call, both in `metered-responses.ts`; no alternate call was found in `src` or `scripts`. Repeat that search when adding an AI feature. Provider project ownership, enforced $25 configuration, current-month baseline, production App Hosting overrides/budget record, live quality, and any model migration remain unverified. The next safe step is to collect and review those deployment/project facts without sending a paid request, then prepare the paused production configuration for approval.

## Release Gate

Run from a clean checkout:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm test:rules
pnpm test:e2e
pnpm build
```

The E2E command starts fresh Firebase emulators, seeds deterministic accounts, builds an isolated optimized Next.js application, and runs desktop plus mobile Playwright projects. It verifies public/authenticated workflows, WCAG A/AA checks, responsive overflow, SEO metadata, security headers, and administrator audit creation.

## Rollout

1. Review the App Hosting rollout environment and confirm no emulator values are present. Confirm that the OpenAI activation gate is satisfied before enabling paid generation and that any private preview using `MOCK` remains clearly labelled. Confirm `STRIPE_MODE=LIVE` before a rollout intended to collect real payments.
2. Verify `/`, `/sign-in`, `/robots.txt`, and `/sitemap.xml` return successful responses on the rollout URL.
3. Sign in with a non-admin smoke-test account and verify feed, resources, dashboard, and logout.
4. Verify Stripe Checkout and Customer Portal in the configured Stripe mode, then confirm webhook reconciliation.
5. Promote gradually while monitoring server errors, webhook failures, elevated administrator actions, and quota anomalies.

Roll back to the previous healthy App Hosting rollout if authentication, trusted writes, billing reconciliation, or core route error rates regress. Rules and index deployments are independent; roll them back only after checking compatibility with the previous application version.

## Account deletion and checkout operations

Account deletion persists a job in `accountDeletions/{uid}` and returns an opaque receipt before cleanup runs through Next.js `after`. The receipt page polls coarse status without exposing account information. Cleanup cancels subscription renewal and expires checkout first, then blocks access, removes owned content, reactions, uploads, private records and Firebase identity. Billing and moderation/audit records and other participants' messages remain. Inspect `/admin/deletions` for failed or interrupted jobs; retry processing jobs only after their ten-minute lease expires. An interrupted request is not an automatic background retry: administrators must monitor this queue.

Deploy the accompanying Firestore collection-group indexes and both security rule files before this application version. The rules require active profiles for authenticated data/file access, including previously issued tokens belonging to deleted accounts.

Checkout reserves one durable idempotency key per account and reuses its Stripe session across tabs. Closing checkout expires an unpaid session; completed sessions remain protected from a duplicate purchase while webhooks reconcile. Configured Stripe prices must match the central USD pricing in `src/lib/billing/pricing.ts` ($9/month or $79/year); mismatches fail before checkout creation. Confirm both prices and webhook reconciliation in Stripe test mode before release.
