# VistaTeacher launch assessment

Review updated: 25 November 2026. This is an implementation and local runtime audit,
not a certification of the deployed service. **The project is not ready for a
public launch against the agreed product scope yet.**

## Product decisions from the interview

| Area                | Agreed direction                                                                                                       |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Launch audience     | A teacher community sharing and discovering resources                                                                  |
| Business model      | Free community tools; paid AI usage and premium features                                                               |
| Generators          | Excellent lessons and worksheets first; units and presentations later                                                  |
| Subject coverage    | Any school subject, with teacher-supplied filters and optional context                                                 |
| AI                  | Send the teacher's brief to OpenAI through the server                                                                  |
| Export target       | Google Docs and PDF; Google Slides when presentations are introduced                                                   |
| Export publishing   | Offer community publishing during Google Docs export; publish a resource copy and keep the original Google Doc private |
| Worksheet controls  | Teachers select question types, a total count and difficulty; AI balances the selected types                           |
| Worksheet types     | Multiple choice, short answer, extended response, matching, fill-in-the-blank and true/false                           |
| Publishing          | Publish immediately, with reporting and admin moderation                                                               |
| Messages            | Each recipient chooses whether to accept non-connection messages                                                       |
| Design              | Preserve the current brand; improve clarity and consistency                                                            |
| Interface language  | English (US)                                                                                                           |
| Content language    | Teacher selects the language for generated teaching materials                                                          |
| Currency            | US dollars by default; currency choice through Stripe                                                                  |
| Sign-in destination | Community feed with quick access to teaching tools                                                                     |

No new subscription prices or AI allowances were selected. Existing Community
and Plus entitlements remain in place.

## Evidence

- [Before screenshots and control inventory](evidence/before/audit.json): 19
  pages at 1440×1000 and 390×844, including public, authentication, community,
  generators, profiles, and settings pages.
- [After screenshots and control inventory](evidence/after/audit.json): 26 routes
  at both viewport sizes, plus generated-result screenshots.
- [Link destinations and actual navigation clicks](evidence/navigation.json):
  77 current/stable internal targets and 27 journeys across 1440px, 1024px and 390px widths. The report separately records 27 removed historical test profiles.
- [Desktop lesson builder before](evidence/before/desktop-ai-lessons.png) /
  [after](evidence/after/desktop-ai-lessons.png).
- [Mobile lesson builder before](evidence/before/mobile-ai-lessons.png) /
  [after](evidence/after/mobile-ai-lessons.png).
- [Generated lesson, desktop](evidence/after/chromium-generated-lesson.png) /
  [mobile](evidence/after/mobile-chrome-generated-lesson.png).
- [Community landing page, desktop](evidence/after/desktop-app.png) /
  [mobile](evidence/after/mobile-app.png).
- [Mobile forum controls](evidence/after/mobile-forum-controls.png) /
  [desktop resource ratings](evidence/after/desktop-rating-controls.png).
- [Notification verification](evidence/notifications/verification.json), with
  ten desktop/mobile captures: [desktop unread inbox](evidence/notifications/chromium/unread.png),
  [mobile menu](evidence/notifications/mobile-chrome/menu.png), and
  [failure recovery](evidence/notifications/mobile-chrome/recovery.png).
- [Native Docs export verification](evidence/google-docs/verification.json), with
  sixteen desktop/mobile captures: [private student Doc](evidence/google-docs/chromium/private-doc-ready.png),
  [community copy review](evidence/google-docs/chromium/review-community-copy.png),
  [mobile answer-key warning](evidence/google-docs/mobile-chrome/answer-key-publication-warning.png),
  and [lesson export](evidence/google-docs/mobile-chrome/lesson-private-doc-ready.png).

The initial captures used fallback fonts because Google Fonts downloads failed
in this environment. The final captures use the same brand families bundled
locally. Screenshots use seeded demo data. A viewport capture does not prove
every button works; action tests and link checks are recorded separately.
The [source route inventory](evidence/project-inventory.json) records 47 page
files and 58 API handlers at the start of the review. Capturing 26 routes does
not establish complete visual or interaction coverage of all admin, account
recovery and operational flows. The [current source inventory](evidence/project-inventory-current.json)
contains 50 page files and 67 API handler files after the worksheet and Google
export additions. The four Google export handler files are private authenticated
APIs, not additional navigation destinations.

## Current pages and navigation

| Journey                | Existing pages and elements                                                                                | Assessment                                                                                                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public website         | Home, About, Pricing, Help, privacy/cookies/terms, public educator profiles                                | Coherent branding and clear free/paid split. The home page is long and relies on carousels instead of demonstrating useful resources early.                               |
| Account access         | Sign up/in, password reset, email verification, onboarding                                                 | Implemented authentication and return destinations. Live email/provider delivery still needs staging verification.                                                        |
| Community              | Feed with community/connections/saved views, discovery filters, network requests, forum categories/threads | Core journeys exist. Discovery, relationships and resources have bounded readers that need pagination before larger usage.                                                |
| Communication          | Inbox, new conversation, conversation attachments and reports, notification menu and page                  | Feature rich, but request recovery and privacy consistency had concrete defects, addressed below.                                                                         |
| Teaching materials     | Resource library, filters, grid/list, creation and detail pages; lesson builder and shared lesson detail   | Resources and lessons exist. A batch of lessons is not a coherent unit. Private worksheets now support all six question types. Units and presentations remain incomplete. |
| Account and operations | Profile, settings/privacy/security/billing, support, admin moderation and deletion queue                   | Broad operational coverage. Real billing, support delivery, deletion recovery and moderation procedures need live-environment evidence.                                   |

Desktop and mobile primary navigation already use one shared route definition.
Settings links now also come from one shared definition, removing duplicated
markup and styling. The initial audit exercised eight primary destinations. The
worksheet release adds a ninth: all 27 current journeys and all 77 current/stable
linked targets pass. Historical screenshot links to 27 temporary profiles are
recorded separately because rule tests reset the demo database; these are not
links found on current pages. Current links are collected afresh during navigation. An initial
download failure exposed a missing sample file in the emulator seed; the seed
now uploads a real sample PDF and the repeated check passes. The direct private
lesson fixture correctly returns 404 to another teacher in both viewport audits.

The project pins pnpm and documents pnpm throughout its release process. The
duplicate npm lockfile was removed so dependency changes have one authoritative
lockfile.

## Defects fixed in this pass

| Finding                                                                                                         | Resulting behavior                                                                                                                                                                               |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Connection requests could stay disabled forever after a network failure; accepting failures lost incoming state | One shared action path, accurate rollback of current status/direction, retryable failures, shared 44px Button, busy state and cancellation/removal tooltips                                      |
| Notification updates and pagination could stay pending after rejected fetches                                   | Request errors are handled; loading always clears; existing items and cursors remain available for retry                                                                                         |
| A partially failed notification group discarded successful updates in the interface                             | Successful items update independently; failed items remain retryable                                                                                                                             |
| Notification menu ignored HTTP failures and created an unhandled rejection chain                                | Failed updates retain their saved state with feedback; pending IDs prevent overlapping local read/unread actions                                                                                 |
| “Mark all read” only updated 100 server records                                                                 | Server processes bounded batches across the active inbox; archive history and notifications after the captured cutoff stay unchanged                                                             |
| Profiles restricted messaging while the API bypassed that restriction                                           | Private recipient preference and one shared policy; server rechecks every send, including existing conversations; blocks override opt-in; profiles use the derived capability                    |
| Fixed subject and grade selectors excluded valid teaching contexts                                              | Free text with suggestions for any subject, age group or mixed class                                                                                                                             |
| Teacher context was too limited                                                                                 | Optional curriculum/country, output language, class size, available materials and additional instructions are persisted and forwarded to OpenAI                                                  |
| “AI Insights” and field regeneration only displayed canned instructions                                         | Removed misleading AI controls; genuine lesson regeneration and feedback remain                                                                                                                  |
| Generated activity times and teaching parameters were not checked against the brief                             | Server validates total activity time, requested duration, subject and age group; a bounded repair receives the validation error                                                                  |
| Long accepted briefs broke deterministic generation                                                             | Mock titles/objectives/standards stay within output limits; maximum-length inputs are covered                                                                                                    |
| Lesson actions, feed composer, resource filters and billing controls used undersized or inconsistent targets    | Shared lesson/connection/resource controls and 44px targets on the identified high-traffic controls; optional teaching context is progressively disclosed                                        |
| Compilation depended on Google Fonts availability                                                               | Existing brand fonts and licenses are bundled locally                                                                                                                                            |
| PDF export removed non-ASCII text and could overflow on long tokens                                             | Shared PDF renderer with embedded fonts and a mathematical fallback, measured wrapping, A4 pages, repeated headers and page numbers; unsupported scripts return a useful Word-export alternative |
| Pricing advertised paid resource access while shared resources are free                                         | Pricing, plan summaries and cancellation copy now describe free community resources and the actual paid AI/analytics benefits                                                                    |

Visual inspection also found that generating on mobile could leave the teacher
scrolled past the result, looking at the footer. New or updated results now scroll
into view and receive accessible focus. The browser test checks that the result
is actually in the viewport. Dark lesson toolbars use the shared inverse Button
variant, and status toasts use accessible text colors.

The result toolbar now groups actions under Edit, Export and More, with private
or published status visible alongside the teaching details. Browser checks cover
deletion cancellation and keyboard focus restoration as well as PDF delivery.
The mock provider is explicitly labeled sample mode. A full Chromium run passed
native PDF navigation; the default headless shell instead downloads the PDF,
as documented by [Playwright](https://playwright.dev/docs/api/class-page#page-goto).
This distinction is handled in the action test rather than treating a blank
headless viewer as a failed server export.

The final control inventory includes 465 enabled button instances. All meet the
44px target with a 1px measurement tolerance. Follow-up fixes cover password
visibility, rating stars, forum comment controls, feed counters and the resource
filter trigger. Rating selection and forum edit cancellation were also exercised
in the browser; the close-up screenshots above show their final layout.

The privacy default is connections only when a setting is missing. This closes
the API bypass and matches the former profile UI. Existing non-connection
conversations can still be read, but sending requires the recipient to opt in
or accept the connection. This behavior change must be called out to existing
users before rollout.

## Worksheet workflow added after the initial audit

Teachers select any of the six question types, a total of 1?30 questions, and
a difficulty. Every selected type is included and counts differ by at most one.
The form shows the planned mix before generation. Optional subject context,
curriculum, language, class size, materials and teacher instructions are shared
with the lesson workflow and forwarded to the configured OpenAI provider.

The new Worksheets navigation entry opens a private, paginated library. Teachers
can create from a brief or from an owned lesson; the authorized lesson version is
retained as a reference snapshot. The editor supports all six question types,
matching partners, fill-in alternatives, answer spaces, reordering and deletion.
Question changes require the teacher to review the corresponding answer before
saving. Draft recovery includes that review state. Saves detect stale versions,
and history can restore an older version without another AI charge.

PDF and Word exports explicitly separate the student worksheet and answer key.
Student rendering accepts an allowlisted projection without answer-key fields;
artifact tests inspect the actual Word document XML for teacher-only content.
Filenames distinguish mode and saved version. The existing PDF script limitation
below still applies. Native Google Docs delivery remains outstanding.

AI reservations use the same transactional allowance and cooldown as lessons.
Request IDs prevent retry charges; known failures refund the reservation. A
10-minute job lease recovers abandoned reservations on an authenticated workspace
visit or retry, with concurrent recovery and late-provider responses tested.
Regeneration locks edits and deletion, while failed generation preserves the
last saved worksheet. Deploy both new worksheet indexes and the private-read,
server-write rules with the feature. This recovery does not replace production
monitoring or a background job system.

The OpenAI path uses structured output, validates question and answer references,
count/difficulty/language adherence, distinct choices and matching bijections,
and allows one bounded repair. Each response is capped at 16,000 output tokens.
Automated runs use the clearly labeled sample provider and do not establish live
content accuracy, translation quality, latency or 30-question success rates.

The supplemental screenshots in [worksheet evidence](evidence/worksheets/) show
the library, creation, planned mix, student sheet and separate key on desktop and
mobile. They supplement the initial audit batch; the older screenshot inventory
still describes its original capture scope. The browser workflow covers actual
creation, mixed-type draft recovery, teacher edits, all four downloads, revision
restoration, deletion cancellation and deletion. A second scenario exercises
private endpoint access, stale saves, invalid modes and untrusted origins.

The final worksheet supplement includes 12 application screenshots and two
PDF-viewer screenshots, plus the actual [student PDF](evidence/worksheets/sample-student-v2.pdf),
[answer-key PDF](evidence/worksheets/sample-answer-key-v2.pdf),
[student Word file](evidence/worksheets/sample-student-v2.docx) and
[answer-key Word file](evidence/worksheets/sample-answer-key-v2.docx). The reviewed
sample spans two student pages and one teacher-key page. The answer key and
response spaces render separately; the sample is clearly marked demonstration
content. The [student print preview](evidence/worksheets/student-pdf-preview.png)
and [teacher print preview](evidence/worksheets/answer-key-pdf-preview.png) were
rendered in full Chromium.

Final validation passed the 197-test full unit run, 26 final affected tests, 54
Firestore/Storage integration checks, the optimized build with TypeScript, lint,
formatting, and 12 desktop/mobile browser checks. The worksheet browser checks
include ten selected WCAG A/AA scans and button/overflow assertions. The final
build traces include all three PDF fonts for both export route families.

The resource fixture now includes the review represented by its aggregate and
rating total. Resource detail uses singular/plural review and download labels.

## Notification workflow supplement

The header and notification page now use a complete server unread total,
independent of the newest 30 items. The dashboard uses the same calculation
when loaded. Unread means `read == false` and not archived; older records without
an `archived` field remain supported. Both count queries share one read-only
transaction snapshot. Unread and Archived are server filters with their own
pagination, rather than filters over whichever rows the browser has loaded.

Community notification producers share one transaction policy for connection
requests/acceptance, messages, feed/forum reactions and replies, mentions and
resource downloads. They check the recipient's active status, in-app preference
and blocks in both directions before any writes. Opt-out affects future alerts;
existing history stays available and messages still reach the inbox. Mentioning
the owner in a comment produces one mention alert, rather than a second comment
alert for the same event. Billing notices use a separate essential policy and
their actual delivery timestamp, preserving the external event date in the
billing event record.

Single-item changes are transactional and idempotent. Bulk read works in batches
of 400 and captures its upper timestamp from Firestore, avoiding dependence on
the app server's clock. Archive history stays unchanged, and notifications
created after that cutoff stay unread. The Archived view explains this behavior
and omits the inbox bulk action. The menu returns focus to its trigger on Escape;
row actions restore a useful focus target without taking focus away from a
teacher who has moved elsewhere.

One account-scoped provider serializes count refreshes and discards responses
after unmount. It refreshes after local actions, recent realtime changes,
window focus and every 60 seconds while visible. Changes to older items on
another device can take up to one minute to appear. Failed requests retain the
last good data, show a stale/unavailable state with Retry and time out after
20 seconds. Settings now explicitly says community email updates are unavailable;
the previous email toggle promised a channel with no producer or delivery job.

The implementation uses the existing Firebase stack and adds no paid messaging
service. Aggregate counts avoid downloading every unread notification. They are
still billable and scale with matching index entries. The recent listener stays
bounded; summary polling does not fetch the list again. Legacy-compatible list
filling can scan archived history, so monitor that read cost and migrate old
records to a canonical inbox state before very large histories accumulate.
[Firebase aggregation documentation](https://firebase.google.com/docs/firestore/query-data/aggregation-queries),
[Firestore billing](https://firebase.google.com/docs/firestore/pricing).

The [notification verification record](evidence/notifications/verification.json)
includes source hashes and the optimized build ID. Validation passed a 209-test
full unit run, 17 final focused checks (including two added focus regressions),
57 Firestore/Storage checks and four final timestamp/billing checks. Eighteen
desktop/mobile browser checks cover notifications and the existing lesson,
worksheet and messaging workflows. A separate desktop case exercises the
existing contextual menu/read/archive/unarchive/delete journey. Six final
notification checks recaptured ten settled UI states, with ten selected
accessibility scans and no reported violations or horizontal overflow. These
captures are viewport evidence; they do not establish full inbox or assistive
technology coverage. The initial unrestricted-worker unit run timed out in an
unrelated worksheet test; the complete two-worker rerun passed.

## Native Google Docs and independent community copies

Saved lessons and both worksheet modes now share a document projection used by
Word, PDF and Google export. Google authorization loads on intent and opens from
a separate click. Tokens stay in browser memory; the app requests `drive.file`
and creates native Docs in My Drive without sharing-permission writes. The
teacher's selected account, saved version and student/key mode are explicit.

The app freezes the saved document, verifies its bytes and reuses a stored
resumable upload. Bounded claims prevent overlapping tabs from overwriting
progress. Reopening a completed export reuses its existing Doc. Missing Docs and
expired sessions require an explicit new-copy decision and duplicate warning.
Google PDF download is available after creation; existing local PDF/Word
alternatives remain available. No export retry calls OpenAI.

Optional publishing creates one independently moderated Word resource from the
server snapshot. Private briefs, lesson references, Google details and later
Google edits are excluded. Teacher answers require explicit acknowledgement.
Publishing failure leaves the private Doc available. Retries recover the same
resource, and a withdrawn resource stays withdrawn. A reserved upload is shown
as pending until publication completes. Resource-page navigation and another
teacher's download are exercised.

Generated resource reservation and its private job update commit together.
Server-generated file writes are denied to browser Storage clients. Cancellation
keeps a durable cleanup receipt; confirmed uploads release their own write lease
without releasing another writer's lease. Source deletion removes private export
records, while independently published copies and Google Docs remain. Account
deletion now also removes worksheets/history and defers cleanup while an upload
may still finish. Deferred deletion needs an administrator retry after its grace;
the status page displays that time. A background deletion worker remains an
operational improvement.

The final local suite passes 295 unit/component checks in 68 files and 60
Firestore/Storage checks. Six desktop/mobile export journeys pass, with sixteen
dialog screenshots, zero selected Axe violations, zero horizontal overflow and
44px enabled button targets. The first browser run exposed a test-only implicit
textarea-label locator mismatch; it was corrected and all six repeated journeys
pass. Screenshot review also identified the shared dialog header boundary, which
now separates its fixed description from scrolling fields.

**Google authorization and Drive responses are mocked in those browser checks.**
The app APIs, snapshot ownership, resource publication, file bytes, downloads and
navigation use real local Firebase emulators. Real Google consent, sharing,
conversion quality and multilingual PDF shaping still need staging evidence.
See [setup and recovery](../google-docs-export.md). No production OAuth
configuration, billing change, external file creation or deployment was performed.
Private snapshots are capped at 900 KiB each and 100 per teacher; an export
history manager that frees snapshots without deleting teaching materials would
improve this limit's UX.

## Remaining launch work, in order

1. **Google Docs staging.** Configure the application's Web OAuth client,
   exact JavaScript origins and production consent settings. Verify real
   authorization, denied/expired access, ownership, private sharing, account
   switching and resumable conversion with teacher Google accounts, including
   Workspace restrictions. Verify both the private Doc and separate community
   resource copy; Google sign-in alone is not Drive authorization.
   Extend PDF script coverage: local exports preserve supported Unicode, but
   Chinese, Arabic and other unsupported scripts still need a correctly shaped
   rendering path. Native Google Docs PDF export is implemented but still needs
   real document evaluation;
   returning a Word alternative is useful recovery, not complete multilingual PDF support.
2. **Live AI quality and cost evaluation.** Test real teacher briefs across
   subjects, ages, languages and curricula. Measure timing, assessment quality,
   differentiation, unsupported claims, language adherence, latency, retries
   and actual token cost. Automated mock output does not establish quality.
3. **Community completeness.** Paginate the bounded network/discovery/resource
   readers. Community notification preferences and complete unread counts have
   now been implemented and verified locally (see the notification supplement).
   Community email delivery remains unimplemented and the settings page now
   says so. Test message privacy changes from the inbox as well as profiles.
4. **UX tightening.** Make useful community resources visible sooner; reduce
   decorative carousel content; explain empty feeds with practical next steps;
   make saved materials easier to find. The default sign-in and onboarding
   destination is now the community feed, with lesson creation and resource
   shortcuts; safe return destinations and paid-plan setup still take priority. Finish action,
   keyboard, loading, empty and failure-state coverage on detail pages and
   dialogs, including uploads and exports. Keep save controls visible during long
   worksheet edits, shorten the authenticated footer, and add an ink-light print
   layout. Tagged PDF accessibility and classroom print usability still need review.
   Consider prioritizing unread activity in the notification preview and using
   more compact desktop rows while retaining the 44px action targets.
5. **Operational staging gates.** Validate real sign-up/reset/verification,
   uploads/downloads, support delivery, Stripe test checkout/portal/webhooks,
   moderation and account deletion. Then verify the intended production
   environment, domain, provider configuration, indexes/rules, monitoring and
   backups. Bring lesson saves and generation up to the worksheet workflow's
   version-conflict, idempotency and abandoned-job recovery guarantees. Local
   test success is not evidence of those external services.

The current lesson lifecycle has concrete gaps identified by source review:
manual saves have no expected-version fence; abandoned generation has no
expiration/recovery; retries lack stable request IDs; refund does not check a
durable completion state; and partial batch failure hides completed items from
the immediate response. Generation completion also needs an active-account
check. Editing subject, age or duration updates lesson content while regeneration
still uses the old brief, so a teacher's correction can revert. These need the
worksheet workflow's durable guarantees, followed by concurrency and failure
tests. Lesson sample provenance must be stored per version rather than inferred
from today's environment. Printable lesson headings are still English even
when generated prose uses another language. These remain launch work, not
verified generator quality.

Units should later own an ordered outline, shared outcomes and assessment,
with explicit lesson links. Presentations should have real slide structure,
speaker notes and Google Slides export. They are intentionally later phases
under the interview's agreed scope.

## Free and paid implementation choices

Retain the current free community network, messaging and standard exports.
Monetize additional AI preparation and genuine premium capabilities; do not
charge to recover from transient failures. Keep manual edits and repeated
exports free. Avoid adding a paid document-conversion service: the existing
open-source document libraries and Google APIs cover the next requirements.

The configured model is `gpt-4.1-mini`. Official pricing lists $0.40 per million
input tokens and $1.60 per million output tokens. An illustrative 4,000-input /
4,000-output action is $0.008, or $0.40 for 50 such actions before retries,
hosting, storage, payment and email costs. This is an estimate, not measured
production spend. Review model lifecycle and compare quality before changing
the configured model. [OpenAI model documentation](https://developers.openai.com/api/docs/models/gpt-4.1-mini).

Firebase App Hosting requires Blaze even at low usage and includes no-cost
allowances. Cloud Storage also requires Blaze; Spark alone does not cover this
application's hosting and upload stack. The follow-up budget answer assumed
Spark would cover all non-AI costs; no numerical operating budget has been
agreed. The repository configuration uses App Hosting in Europe, so US-only
Storage free allowances must not be assumed. A “free to teachers” product still needs an operating budget and
usage controls; changing hosting platforms is unnecessary for this first
launch. [Firebase App Hosting costs](https://firebase.google.com/docs/app-hosting/costs).
[Cloud Storage billing requirements](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024).

For Google Docs, prefer `drive.file`, which limits access to files created or
explicitly used with the app, and use native creation or supported conversion.
This requires product OAuth configuration, not the developer's connected
Google Drive account. [Google Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth),
[file conversion](https://developers.google.com/workspace/drive/api/guides/manage-uploads#import_to_google_docs_types).

The current checkout validates fixed USD prices. Currency choice is therefore
an outstanding integration task. Stripe supports Adaptive Pricing with embedded
Checkout, managed in its Dashboard, and manual multi-currency Prices as an
alternative. Confirm account eligibility, subscription support, settlement
currency and webhook handling in a Stripe sandbox before enabling it. Adaptive
Pricing adds a 2–4% customer conversion fee; paying the integration currency avoids
that Stripe conversion fee. Do not imply all currencies cost exactly the same.
[Stripe Adaptive Pricing](https://docs.stripe.com/payments/currencies/localize-prices/adaptive-pricing?payment-ui=embedded-page),
[manual currency prices](https://docs.stripe.com/payments/checkout/localize-prices/manual-currency-prices?payment-ui=embedded-page).

## Reproduce the evidence

Use the demo Firebase emulators and `AI_PROVIDER=MOCK`; seed only a demo project.
The scripts expect `community@vista.local` and the repository's development-only
password. They never call the paid AI provider.

```powershell
node scripts/audit-ui.mjs before
node scripts/audit-ui.mjs after
node scripts/audit-navigation.mjs
```

Set `PLAYWRIGHT_BASE_URL` to an emulator-backed app. The audit records status,
actual destination, visible control geometry and styling, page exceptions,
overflow, and selected WCAG A/AA diagnostics. Tests in
`tests/e2e/launch-audit.spec.ts` cover the new messaging policy, teaching context
through generation/editing/export, and bulk notification behavior. Production
AI and payment calls are intentionally outside this automated evidence.

Final verification results are recorded in [verification.json](evidence/verification.json).
