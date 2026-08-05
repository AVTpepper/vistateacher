# Release Operations

## App Hosting

1. Create the Firebase App Hosting backend from the repository root and select Node.js 24.
2. Set `NEXT_PUBLIC_APP_URL` to the final HTTPS origin in both build and runtime environments.
3. Set every `NEXT_PUBLIC_FIREBASE_*` value and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` in the backend environment. App Hosting console values override the declarations in `apphosting.yaml`.
4. Create and grant the backend access to every secret referenced by `apphosting.yaml`: Firebase Admin credentials, Stripe keys/prices, and the OpenAI key. `STRIPE_MODE` is a non-secret server setting; Stripe keys remain secrets.
5. Keep `NEXT_PUBLIC_USE_FIREBASE_EMULATORS=false` and `AI_PROVIDER=OPENAI` in every production rollout.
6. Deploy Firestore rules, Storage rules, and indexes separately before promoting the application rollout.

Create secrets with `firebase apphosting:secrets:set SECRET_NAME`. If a secret was created outside that flow, grant access with `firebase apphosting:secrets:grantaccess SECRET_NAME --backend BACKEND_ID`.

## External Services

- Enable Firebase Email/Password and Google authentication providers and add the production domain to authorized domains.
- Register `https://PRODUCTION_ORIGIN/api/billing/webhook` in the matching Stripe environment with `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, and `customer.subscription.deleted`.
- Keep `STRIPE_MODE=TEST` with an `sk_test_...` secret key, test Price IDs, and the test endpoint signing secret while validating the integration. The application rejects a mode/key mismatch.
- To accept real payments, change `STRIPE_MODE` to `LIVE` and replace all four Stripe secrets together: `STRIPE_SECRET_KEY` (`sk_live_...`), `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PLUS_MONTHLY`, and `STRIPE_PRICE_PLUS_YEARLY`. Test and live webhook signing secrets are different.
- Confirm monthly and yearly Stripe Price IDs belong to the same Stripe environment and account as `STRIPE_SECRET_KEY`.
- Never commit Stripe secret keys or expose them through `NEXT_PUBLIC_*` variables. The browser receives only a test-mode boolean and Stripe's public simulator values.
- The Stripe publishable key is intentionally public and is the only Stripe value allowed in `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`. Embedded Checkout loads Stripe.js directly and keeps payment fields inside Stripe's iframe.
- Restrict Firebase and Google Cloud service accounts to the minimum production roles.

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

1. Review the App Hosting rollout environment and confirm no emulator or mock-provider values are present. Confirm `STRIPE_MODE=LIVE` before a rollout intended to collect real payments.
2. Verify `/`, `/sign-in`, `/robots.txt`, and `/sitemap.xml` return successful responses on the rollout URL.
3. Sign in with a non-admin smoke-test account and verify feed, resources, dashboard, and logout.
4. Verify Stripe Checkout and Customer Portal in the configured Stripe mode, then confirm webhook reconciliation.
5. Promote gradually while monitoring server errors, webhook failures, elevated administrator actions, and quota anomalies.

Roll back to the previous healthy App Hosting rollout if authentication, trusted writes, billing reconciliation, or core route error rates regress. Rules and index deployments are independent; roll them back only after checking compatibility with the previous application version.
