# VistaTeacher

VistaTeacher is a professional community for educators: profiles and networking, a social feed, teaching resources, forums, messaging, notifications, AI lesson planning, subscriptions, analytics, and administrative moderation.

The application uses Next.js App Router, strict TypeScript, Tailwind CSS, shadcn/ui conventions, Firebase Authentication/Firestore/Storage, Firebase Admin, Stripe, and OpenAI. Local development and integration tests use the Firebase Emulator Suite; production data is never seeded automatically.

## Requirements

- Node.js 22 or newer (Node.js 24 is used in CI)
- pnpm 10 or newer
- Java 21 or newer for Firebase emulators
- Firebase, Stripe, and OpenAI accounts for deployed integrations

## Install

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
```

On Windows PowerShell, use `Copy-Item .env.example .env.local`. Populate the public Firebase web configuration. For localhost testing against your real Firebase project, set `NEXT_PUBLIC_USE_FIREBASE_EMULATORS=false` and add `http://localhost:3000` to Firebase Authentication authorized domains. For emulator development, use one demo project ID consistently and set `NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true`. Never commit `.env.local`.

## Local Development

```bash
pnpm dev
```

The app runs at `http://localhost:3000`. If you want emulator-backed development instead, start the Firebase Emulator Suite in a separate terminal and switch `NEXT_PUBLIC_USE_FIREBASE_EMULATORS` back to `true`.

## Firebase Setup

1. Create a Firebase project and web app.
2. Enable Email/Password and Google Authentication providers.
3. Create Firestore in Native mode and a default Storage bucket.
4. Copy `.firebaserc.example` to `.firebaserc` and replace the project ID.
5. Set the `NEXT_PUBLIC_FIREBASE_*` web configuration variables.
6. Set local Admin credentials in `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY`.
7. Review and deploy with `firebase deploy --only firestore,storage`.
8. Set administrator custom claims through a trusted Admin operation. Profile fields never grant administrator access.

Store the quoted private key with literal `\n` sequences; server code converts them to newlines.

## Stripe Setup

1. Create monthly and annual recurring Plus prices.
2. Set both `STRIPE_PRICE_PLUS_*` IDs and keys for the same Stripe mode.
3. Register `/api/billing/webhook` and subscribe to checkout completion, subscription lifecycle, invoice paid, and payment failed events.
4. Set its signing secret as `STRIPE_WEBHOOK_SECRET`.

The browser never writes subscription state. Local webhook tests will use Stripe CLI fixtures and a forwarded signing secret.

## OpenAI Setup

Set `OPENAI_API_KEY` only in the server environment. `OPENAI_LESSON_MODEL` defaults to `gpt-4.1-mini`. Automated tests use a deterministic provider selected by `AI_PROVIDER=MOCK` and never call OpenAI. Production structured output is validated with Zod before persistence.

## Commands

```bash
pnpm dev          # Next.js development server
pnpm build        # Production build
pnpm start        # Start a production build
pnpm lint         # ESLint
pnpm typecheck    # Strict TypeScript check
pnpm test         # Unit and component tests
pnpm test:watch   # Watch unit tests
pnpm test:rules   # Rules tests in Firebase emulators
pnpm test:e2e     # Seeded emulator E2E tests against an optimized build
pnpm emulators    # Firebase Emulator Suite
pnpm seed         # Development-only emulator data
pnpm verify       # Lint, typecheck, unit tests, and build
```

## Firebase App Hosting

`apphosting.yaml` defines runtime sizing, production provider flags, and secret references. Connect the repository to App Hosting, create every referenced secret with App Hosting secret management, set public build variables, and deploy Firestore/Storage rules separately. Configure the production Stripe webhook only after the final URL exists. Follow [docs/release.md](docs/release.md) for the complete rollout and rollback checklist.

## Production Setup Checklist

Use a separate Firebase project for staging before connecting the production domain. Firebase App Hosting and new Cloud Storage projects require the Blaze plan; configure Google Cloud budget alerts before inviting users.

### 1. Prepare GitHub and Firebase

- [ ] Push this repository to GitHub. Keep `.env.local` and service-account JSON files untracked.
- [ ] In the [Firebase console](https://console.firebase.google.com/), create the staging or production project and select the region nearest the expected users.
- [ ] Upgrade the project to Blaze and configure budget alerts.
- [ ] Add a Firebase Web App under Project settings. Copy its web configuration values for the next steps.
- [ ] In Authentication, enable Email/Password and Google. Set the Google support email.
- [ ] Create the default Firestore database in Standard edition, Native mode, and production mode.
- [ ] Create the default Storage bucket. New buckets normally use `PROJECT_ID.firebasestorage.app`.

### 2. Connect the Local Repository

The Firebase CLI is already a project dependency:

```powershell
pnpm exec firebase login
pnpm exec firebase projects:list
Copy-Item .firebaserc.example .firebaserc
```

- [ ] Replace `your-firebase-project-id` in `.firebaserc` with the real project ID.
- [ ] Confirm the active project with `pnpm exec firebase use`.
- [ ] Run all tests in [docs/manual-testing.md](docs/manual-testing.md) before deploying rules.
- [ ] Deploy Firestore rules/indexes and Storage rules:

```powershell
pnpm exec firebase deploy --only firestore,storage --project YOUR_PROJECT_ID
```

This command overwrites console rules with the reviewed repository rules. Do not seed emulator data into a real project.

### 3. Configure App Hosting

- [ ] Open Firebase Console > Hosting & Serverless > App Hosting > Get started.
- [ ] Connect the GitHub repository, use `/` as the app root, choose `main` as the live branch, and enable automatic rollouts only when desired.
- [ ] Choose the same primary region used for the Firebase data services where possible, select Node.js 24, and leave automatic base-image updates enabled.
- [ ] Create or select the Firebase Web App and finish the first rollout.
- [ ] In App Hosting > Backend > Settings > Environment, set these non-secret values for build and runtime:

| Variable                                   | Value                                                                          |
| ------------------------------------------ | ------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_APP_URL`                      | First the generated `https://...hosted.app` URL; later the final custom domain |
| `NEXT_PUBLIC_FIREBASE_API_KEY`             | Firebase Web App `apiKey`                                                      |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`         | Firebase Web App `authDomain`                                                  |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID`          | Firebase project ID                                                            |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`      | Exact default bucket name                                                      |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Firebase Web App sender ID                                                     |
| `NEXT_PUBLIC_FIREBASE_APP_ID`              | Firebase Web App app ID                                                        |

`apphosting.yaml` already fixes `NEXT_PUBLIC_USE_FIREBASE_EMULATORS=false`, `AI_PROVIDER=OPENAI`, and the lesson model for production.

### 4. Create Secrets

The current server expects the secret names declared in `apphosting.yaml`. Create each interactively so values never enter shell history:

```powershell
pnpm exec firebase apphosting:secrets:set FIREBASE_PROJECT_ID --project YOUR_PROJECT_ID
pnpm exec firebase apphosting:secrets:set FIREBASE_CLIENT_EMAIL --project YOUR_PROJECT_ID
pnpm exec firebase apphosting:secrets:set FIREBASE_PRIVATE_KEY --project YOUR_PROJECT_ID
pnpm exec firebase apphosting:secrets:set STRIPE_SECRET_KEY --project YOUR_PROJECT_ID
pnpm exec firebase apphosting:secrets:set STRIPE_WEBHOOK_SECRET --project YOUR_PROJECT_ID
pnpm exec firebase apphosting:secrets:set STRIPE_PRICE_PLUS_MONTHLY --project YOUR_PROJECT_ID
pnpm exec firebase apphosting:secrets:set STRIPE_PRICE_PLUS_YEARLY --project YOUR_PROJECT_ID
pnpm exec firebase apphosting:secrets:set OPENAI_API_KEY --project YOUR_PROJECT_ID
```

- [ ] Generate a dedicated Firebase Admin service-account key in Project settings > Service accounts. Use its `project_id`, `client_email`, and full `private_key` for the first three secrets; never commit the JSON file.
- [ ] Use Stripe test-mode keys and prices for staging. Change all Stripe values together when moving to live mode.
- [ ] Grant the App Hosting backend access when prompted. If needed, run `firebase apphosting:secrets:grantaccess` with the backend ID.
- [ ] Trigger a new App Hosting rollout and confirm the generated URL works.

### 5. Finish Authentication and Integrations

- [ ] Add the generated App Hosting hostname to Firebase Authentication > Settings > Authorized domains.
- [ ] Configure the Google provider's authorized domain/redirect settings if requested by Firebase.
- [ ] Register `https://GENERATED_HOST/api/billing/webhook` in Stripe TEST mode and subscribe to checkout completion, subscription lifecycle, invoice paid, payment failed, invoice upcoming, and charge refunded events.
- [ ] Save the resulting signing secret as `STRIPE_WEBHOOK_SECRET` and roll out again.
- [ ] Complete the staging smoke tests in [docs/manual-testing.md](docs/manual-testing.md).

### 6. Connect the Custom Domain

- [ ] In App Hosting > Backend > Settings > Domains, choose Add custom domain.
- [ ] Enter the apex domain (`example.com`) or a subdomain (`app.example.com`) and choose whether the other hostname should redirect to it.
- [ ] Add exactly the TXT, A, CNAME, or CAA records shown by Firebase to the DNS provider. Do not copy example values from documentation.
- [ ] Remove conflicting A/AAAA/CNAME records only when the Firebase wizard instructs you. Keep any `_acme-challenge` CNAME used for certificate renewal.
- [ ] Click Verify records. DNS and managed SSL can take several hours and occasionally up to 24 hours.
- [ ] Wait for the Firebase domain status to become Connected before treating the domain as live.
- [ ] Change `NEXT_PUBLIC_APP_URL` to the final HTTPS domain and trigger another rollout.
- [ ] Add the final domain to Firebase Authentication authorized domains.
- [ ] Change the Stripe webhook endpoint to `https://YOUR_DOMAIN/api/billing/webhook` and verify delivery.
- [ ] Run the Production Domain Smoke Test in [docs/manual-testing.md](docs/manual-testing.md).

Official references: [App Hosting setup](https://firebase.google.com/docs/app-hosting/get-started), [custom domains](https://firebase.google.com/docs/app-hosting/custom-domain), and [Firebase CLI](https://firebase.google.com/docs/cli).

## Testing from Another Computer

`localhost` always means the computer opening the URL. Another device cannot use your `http://localhost:3002`; on the same Wi-Fi/LAN it can try this computer's LAN address, currently `http://192.168.50.16:3002`.

Find the current Wi-Fi IPv4 address with:

```powershell
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -eq "Wi-Fi" -and $_.AddressState -eq "Preferred" } | Select-Object IPAddress
```

Requirements:

- Both devices must be on the same local network, not merely connected to the internet through different routers.
- Windows Firewall must allow Node.js on private networks, and the router must not enable client/AP isolation.
- Keep the development server running. The LAN address may change after reconnecting to Wi-Fi.
- Do not port-forward the development server or expose it directly to the public internet.

The current Next.js process listens on all local interfaces. However, when `NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true`, browser Firebase requests use `127.0.0.1`; on the second device that points back to the second device, so authentication and data features will not work. Public/UI pages may still load. For full remote-device testing, connect VistaTeacher to the real staging Firebase project, or make emulator hosts LAN-configurable and bind the emulators to the LAN in a separate hardening change.

## Troubleshooting

- Emulator errors: check ports `9099`, `8080`, and `9199`, plus the emulator environment flag.
- Admin credential errors: preserve private-key quotes and literal `\n` characters.
- Rules startup errors: run `java -version` and install a supported Java runtime.
- Localhost canonical URLs: set `NEXT_PUBLIC_APP_URL` at build and runtime.
- Font build failures: allow build access to Google Fonts; `next/font` self-hosts the resulting assets.

See [docs/manual-testing.md](docs/manual-testing.md), [docs/release.md](docs/release.md), [docs/architecture.md](docs/architecture.md), [docs/data-model.md](docs/data-model.md), [docs/security.md](docs/security.md), and [docs/build-plan.md](docs/build-plan.md).
