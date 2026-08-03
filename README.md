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

On Windows PowerShell, use `Copy-Item .env.example .env.local`. Populate the public Firebase web configuration. For emulator development, use one demo project ID consistently and set `NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true`. Never commit `.env.local`.

## Local Development

```bash
pnpm emulators # terminal 1
pnpm seed      # terminal 2, development data only
pnpm dev       # terminal 2
```

The app runs at `http://localhost:3000`; Emulator UI runs at `http://localhost:4000`.

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
3. Register `/api/stripe/webhook` after its implementation and subscribe to checkout completion, subscription lifecycle, invoice paid, and payment failed events.
4. Set its signing secret as `STRIPE_WEBHOOK_SECRET`.

The browser never writes subscription state. Local webhook tests will use Stripe CLI fixtures and a forwarded signing secret.

## OpenAI Setup

Set `OPENAI_API_KEY` only in the server environment. Automated tests use a deterministic provider selected by `AI_PROVIDER=MOCK` and never call OpenAI. Production structured output is validated with Zod before persistence.

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
pnpm test:e2e     # Playwright tests
pnpm emulators    # Firebase Emulator Suite
pnpm seed         # Development-only emulator data
pnpm verify       # Lint, typecheck, unit tests, and build
```

## Firebase App Hosting

`apphosting.yaml` defines runtime sizing and secret references. Connect the repository to App Hosting, create every referenced secret with App Hosting secret management, set public build variables, and deploy Firestore/Storage rules separately. Configure the production Stripe webhook only after the final URL exists.

## Troubleshooting

- Emulator errors: check ports `9099`, `8080`, and `9199`, plus the emulator environment flag.
- Admin credential errors: preserve private-key quotes and literal `\n` characters.
- Rules startup errors: run `java -version` and install a supported Java runtime.
- Localhost canonical URLs: set `NEXT_PUBLIC_APP_URL` at build and runtime.
- Font build failures: allow build access to Google Fonts; `next/font` self-hosts the resulting assets.

See [docs/architecture.md](docs/architecture.md), [docs/data-model.md](docs/data-model.md), [docs/security.md](docs/security.md), and [docs/build-plan.md](docs/build-plan.md).
