# Google Docs export setup

Saved lessons and worksheets can be converted to private native Google Docs.
Teachers can download a PDF through Google and optionally publish a separate
Word resource copy. Production availability requires a configured Google OAuth
client and a successful real-account staging check.

## Configure Google authorization

1. Use separate Google Cloud projects for development/testing and production.
   Enable the Google Drive API. Configure Google Auth Platform branding,
   audience, support contacts, homepage, privacy policy and authorized domains.
2. Create an OAuth **Web application** client. Register each exact authorized
   JavaScript origin, including its scheme and port. For local testing use the
   actual local app origin; production should contain production origins only.
   This browser token flow does not use a server callback or client secret.
3. Request only `https://www.googleapis.com/auth/drive.file`. This scope is
   classified as non-sensitive and covers files created or opened with the app.
   Testing projects need authorized test users; production publishing, branding
   and any verification requirements must be completed in Google Cloud.
4. Set `NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID` to the Web client ID. This public ID
   must be available at **build time**; rebuild after changing it. For Firebase
   App Hosting, add the variable to the environment with BUILD and RUNTIME
   availability. Do not place a client secret in this variable. A missing ID
   keeps an honest unavailable message with existing Word/PDF alternatives.
5. Keep the SDK source `https://accounts.google.com/gsi/client` and required
   Google endpoints allowed by the application's CSP. The SDK loads only after
   export intent; authorization opens from a separate teacher click.

Google's [authorization library](https://developers.google.com/identity/oauth2/web/guides/load-3p-authorization-library),
[Drive scope guide](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
and [production OAuth guidance](https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance)
describe these requirements. The developer's connected Drive account is not
the application's OAuth configuration.

## Privacy and recovery

Google access tokens remain in browser memory and never go to VistaTeacher APIs
or persistent browser storage. Teachers select the destination account. DOCX
conversion creates a native Google Doc in My Drive without parent folders or
permission writes; `ignoreDefaultVisibility=true` bypasses domain-wide default
visibility. Google organization policies and account limits still apply.
[Native conversion and resumable uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads)
and [file creation options](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/create)
define this behavior.

The server freezes the saved version and student/key projection before upload.
Private briefs, student-needs fields and private lesson references are excluded.
Owner-only API responses provide the frozen bytes and a SHA-256 check. Jobs bind
the teacher, source version, mode and Google account. Upload session URLs are
private credentials: do not log them, tokens, document bytes or account details.
Direct Firestore clients cannot access these jobs.

Five-minute fenced claims coordinate tabs. A saved resumable session is probed
before retransmission using the same bytes. Reopening a completed export uses
its existing Doc, preserving Google edits. Closing the browser stops work; an
expired token needs reconnection. Expired sessions or missing files require an
explicit new-copy choice with a duplicate warning. Remote exactly-once creation
cannot be guaranteed after ambiguous failures.

Community publishing uses the server snapshot, never later Google edits or
browser-supplied file bytes. It has independent retries and immediate moderation
visibility. Answer keys require explicit acknowledgement in the UI. One resource
copy is recorded per export; retries do not resurrect a withdrawn copy. Normal
resource editing, removal, reporting and moderation remain available.

Deleting the source revokes its pending exports and removes private snapshots.
Published copies and teacher-owned Google Docs remain independent. Account
deletion removes app records and owned resource storage; Google files stay in
the teacher's Drive. Generated upload cancellation leaves durable cleanup
receipts if Storage deletion fails. A bounded drain retries up to ten receipts
on the next export creation or source deletion; a fifteen-minute grace covers
in-flight writes. Idle abandoned cleanup requires a later action or an
operational cleanup run. There is no background export worker.

Confirmed uploads release their own write leases immediately. If account
deletion encounters an active or ambiguous upload, access is revoked and the
deletion job stays pending until its bounded write grace ends. The status page
shows when an administrator can resume it through the deletion queue. No
automatic deletion worker has been introduced; this recovery needs an
operational owner before launch. Account cleanup also removes worksheets and
their version history.

## Free and paid operation

Keep standard exports free. Google Drive Standard Tier is currently available
at no cost within its quotas. Scaled Tier is optional and introduces billing
above daily REST allowances from April 1, 2027; review quotas and alerts before
changing tiers. [Google Workspace pricing and billing tiers](https://developers.google.com/workspace/guides/quota-pricing).
This implementation calls Drive directly from the browser; it does not use a
paid conversion vendor or MCP server. Teacher Drive storage and organization
policies apply separately.

VistaTeacher still pays its own Firestore/Storage/hosting costs. Private exports
are limited to 900 KiB each and 100 snapshots per teacher. Existing snapshots
remain reusable; deleting source materials frees their snapshot slots. Manual
Word/PDF downloads remain available. Export and publishing retries do not call
OpenAI or spend AI actions. Measure real AI use and storage costs before
expanding paid allowances.

## Staging verification before release

- Test consent, denied access, closed/blocked popups, expired tokens, a second
  Google account and a Workspace account with administrator restrictions.
- Open the resulting native Doc in Drive and inspect its ownership and sharing.
  Confirm no domain/public access was added, including a Workspace domain with
  default sharing enabled.
- Review a real lesson and all six worksheet types after conversion. Test
  English, Arabic and Chinese content and inspect downloaded Google PDFs for
  glyphs, shaping, page breaks, answer spaces and key separation.
- Interrupt uploads, reload, reconnect and verify the same completed Doc is
  reused. Check explicit replacement and ambiguous-failure messaging.
- Publish a reviewed copy, download it as another teacher and verify private
  details are absent. Remove the copy and confirm export retries keep it removed.
- Test source/account deletion and cleanup recovery without changing private
  Google sharing. Deploy updated Storage rules before enabling the feature.

Local Google checks mock GIS and Drive only. They validate app behavior and
ownership against Firebase emulators; they do not prove real OAuth, Google
conversion quality or multilingual PDF rendering.
