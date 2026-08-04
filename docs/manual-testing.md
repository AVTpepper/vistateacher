# Manual Testing Checklist

Use this checklist before inviting external testers and again before every production release. Record failures with the route, account, browser, viewport, exact steps, expected result, actual result, and a screenshot.

## 1. Automated Baseline

- [ ] Install Java 21 or newer and the Playwright Chromium browser.
- [ ] Run `pnpm install --frozen-lockfile`.
- [ ] Run `pnpm lint`.
- [ ] Run `pnpm format:check`.
- [ ] Run `pnpm typecheck`.
- [ ] Run `pnpm test`.
- [ ] Run `pnpm test:rules`.
- [ ] Run `pnpm test:e2e`.
- [ ] Run `pnpm build`.

Do not continue if any command fails. `pnpm test:e2e` starts fresh Firebase emulators, seeds deterministic accounts, builds an isolated production app, and tests desktop and mobile workflows.

## 2. Local Manual Environment

Start the emulator suite, seed it, and start Next.js in separate PowerShell terminals:

```powershell
pnpm emulators
```

```powershell
$env:AI_PROVIDER="MOCK"
pnpm seed
pnpm dev -- --port 3002
```

Open `http://localhost:3002`. Emulator UI is at `http://localhost:4000`.

Seeded accounts all use password `VistaTeacher1!`:

| Role                   | Email                   |
| ---------------------- | ----------------------- |
| Community educator     | `community@vista.local` |
| Plus educator          | `plus@vista.local`      |
| Additional educator    | `jordan@vista.local`    |
| Platform administrator | `admin@vista.local`     |

Reseed to restore deterministic data after destructive moderation tests.

## 3. Public and Account Pages

Test once at desktop width and once around 390 px mobile width.

- [ ] `/` loads with no missing images, overlap, horizontal page scroll, or console errors.
- [ ] Main navigation reaches About, Pricing, Help, sign-in, and sign-up.
- [ ] `/about`, `/pricing`, `/help`, `/privacy`, and `/terms` have the correct title and visible heading.
- [ ] `/robots.txt` and `/sitemap.xml` load successfully.
- [ ] Keyboard-only navigation has a visible focus state and logical order.
- [ ] Sign-up validates bad email, weak password, and missing name input.
- [ ] Password reset accepts a valid email without exposing whether an account exists.
- [ ] Protected routes redirect a signed-out visitor to `/sign-in`.

## 4. Educator Authentication and Onboarding

- [ ] Create a new account with a unique email.
- [ ] Confirm the verification screen appears before platform access.
- [ ] Verify the email in the Auth emulator or Firebase console.
- [ ] Sign in and complete every onboarding field.
- [ ] Refresh the page and confirm the session remains active.
- [ ] Log out and confirm protected pages redirect to sign-in.
- [ ] Sign in with `community@vista.local` for the remaining Community-plan checks.

## 5. Profile, Settings, and Network

- [ ] Open your profile and edit name, school, subjects, bio, and location.
- [ ] Upload safe avatar and cover images; reject unsupported or oversized files.
- [ ] Toggle contact privacy and verify another educator sees only permitted fields.
- [ ] Search educators by name and apply subject, grade, location, and verification filters.
- [ ] Follow and unfollow an educator; verify both profile counters update.
- [ ] Verify the Community connection limit is enforced without changing counters incorrectly.
- [ ] Submit an account deletion request only after exact confirmation.

## 6. Feed and Notifications

- [ ] Create a text post, question, and image post.
- [ ] Like, unlike, bookmark, and unbookmark a post.
- [ ] Add a comment and confirm the trusted counter changes once.
- [ ] Switch among All, Following, and Saved feeds.
- [ ] Report another educator's post and verify duplicate reporting is blocked.
- [ ] Delete your own post and verify another educator cannot delete it.
- [ ] Confirm relevant actions create recipient notifications.
- [ ] Mark notifications read and refresh to confirm persistence.

## 7. Resources

- [ ] Search, filter, sort, and switch resource grid/list views.
- [ ] Open a resource detail page and submit or update one review.
- [ ] Upload an allowed file whose metadata matches the reservation.
- [ ] Cancel an upload and confirm no active resource or orphaned object remains.
- [ ] Reject unsupported type, excessive size, and mismatched reservation attempts.
- [ ] Confirm a Community educator cannot download a Plus-only resource unless they own it.
- [ ] Confirm a Plus educator can download an authorized file as an attachment.
- [ ] Delete an owned resource and verify metadata, reviews, object, and counters reconcile.

## 8. Forum

- [ ] Filter discussions by category and create a thread.
- [ ] Reply, like, unlike, and report content.
- [ ] Accept one answer as the thread owner.
- [ ] Lock and unlock an owned discussion; verify replies respect the lock.
- [ ] Verify a normal educator cannot pin a thread.
- [ ] Delete a reply or thread and confirm solved/category/reaction counters reconcile.

## 9. Messages

- [ ] Start a conversation and confirm the deterministic pair does not duplicate.
- [ ] Send messages from both accounts and verify real-time delivery.
- [ ] Refresh and load older history.
- [ ] Upload and download an authorized PDF or image attachment.
- [ ] Verify a non-participant cannot read the conversation or attachment.
- [ ] Block an educator and confirm sending and starting conversations are denied both ways.
- [ ] Report a message once and confirm duplicate reports are blocked.
- [ ] Verify the Community daily send limit and unread counters.

## 10. Plus, AI Lessons, Dashboard, and Billing

Use `plus@vista.local` for Plus workflows. Automated/local AI uses `AI_PROVIDER=MOCK`.

- [ ] Community dashboard shows summaries but not Plus trend series.
- [ ] Plus dashboard shows trends, recommendations, usage, and subscription state.
- [ ] Community educator cannot generate or export a Plus lesson.
- [ ] Plus educator creates, edits, regenerates, duplicates, and versions a lesson.
- [ ] Export authorized lessons to PDF and DOCX.
- [ ] Verify AI monthly quota and cooldown are enforced without consuming failed attempts.
- [ ] Confirm pricing proceeds directly to monthly or yearly Stripe Checkout.
- [ ] Complete monthly and yearly Checkout with Stripe test cards.
- [ ] Open Customer Portal and verify cancellation/reactivation states reconcile through webhooks.

## 11. Administration

Sign in as `admin@vista.local`.

- [ ] Administration navigation and all five admin pages load.
- [ ] A normal educator cannot see admin navigation, open `/admin`, or call the admin action API.
- [ ] Suspend and reactivate an educator.
- [ ] Verify an administrator cannot suspend themselves or another platform administrator.
- [ ] Approve and reject content with an explicit reason.
- [ ] Resolve and dismiss reports; verify pending totals never go below zero.
- [ ] Approve and reject verification requests and confirm educator verification changes.
- [ ] Every mutation creates one immutable audit entry with actor, target, state, reason, and timestamp.
- [ ] Admin tables scroll inside their container on mobile without body overflow.

## 12. Production Domain Smoke Test

Run this only after Firebase App Hosting and the custom domain are connected.

- [ ] HTTPS is valid and HTTP redirects to HTTPS.
- [ ] Apex and `www` behavior matches the redirect choice made in App Hosting.
- [ ] Home, sign-in, robots, sitemap, and legal pages return successful responses.
- [ ] Canonical URLs use the production domain.
- [ ] Email/password and Google sign-in work on the production domain.
- [ ] Create two disposable educator accounts and test profile, follow, feed, message, resource, and forum flows.
- [ ] Complete one Stripe test-mode Checkout and confirm the webhook updates billing state.
- [ ] Generate one lesson with the configured OpenAI provider.
- [ ] Complete one admin action and inspect its audit entry.
- [ ] Check App Hosting logs for errors and Firebase/Google Cloud billing dashboards for unexpected usage.

## Sign-Off

- Tester:
- Date:
- Build or commit:
- Environment and URL:
- Browsers/devices:
- Failed checks and issue links:
- Release decision: pass / block
