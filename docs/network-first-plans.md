# Network-first plans

VistaTeacher's core network is free. Plus sells more AI preparation capacity and the existing analytics and Plus-resource access. Prices remain $9/month or $79/year. This change does not add a new Stripe product or alter subscription lifecycle handling.

| Capability                               | Community                                  | Plus                                    |
| ---------------------------------------- | ------------------------------------------ | --------------------------------------- |
| Profiles, connections, feed, discussions | Included; no connection quota              | Included                                |
| Messaging                                | No daily subscription quota                | Same                                    |
| Community resource sharing               | Included; existing file validation applies | Included                                |
| Standard PDF / Word lesson exports       | Unlimited                                  | Unlimited                               |
| AI actions per calendar month            | 3, in any creation/refinement mix          | 50, in any creation/refinement mix      |
| Manual lesson edits and duplication      | No AI usage                                | No AI usage                             |
| Full analytics and Plus resources        | Basic analytics; community resources       | Full analytics and Plus-resource access |

Each generated lesson costs one action; generating a batch of N costs N actions. Each AI regeneration/refinement costs one action. Monthly usage resets at 00:00 UTC on the first day of the next calendar month, independently of the Stripe renewal date. Failed generation releases its reservation. The existing generation cooldown still applies. Legacy monthly counters are retained, so this release does not reset anyone's usage or require data migration.

Resources are files uploaded by members; exports render a lesson inside VistaTeacher into a document. Free standard exports remain usable when the AI allowance is exhausted. Exports still require an active owner and do not grant access to another member's private lesson or a Plus-only resource.

Messages and connection requests retain authentication, active-account checks, block checks where applicable, and trusted writes. All plans share persistent burst protections: 20 message sends or 10 connection requests per 60-second window. These are temporary HTTP 429 errors with retry guidance, never upgrade prompts. A rejected action does not create its message, relationship, notification, or counter increment. Accepting an incoming connection is not subscription-gated.

## Next paid features to validate

These are proposals, not included in the current plan promises:

1. Linked unit planning: coherent lesson sequences with assessments and differentiation.
2. Reusable planning templates and teaching preferences; branded export templates for coaches.
3. Private planning spaces and co-editing, with free members able to accept invitations.
4. Saved professional searches, relevant opportunity alerts, and service/inquiry pages once network activity supports them.

Validate willingness to pay through repeat use, interviews, paid conversion, and retention. Track cost per successful AI action and per active subscriber before increasing the 50-action allowance. Track reports and rejected requests alongside reciprocal conversations after removing the network caps. Do not infer demand or cost viability from emulator fixtures. Larger networks also need a separate review of discovery and connection-list pagination, whose readers remain bounded.

## Focused manual checks

- Compare home, pricing, billing, and checkout: all show the same capabilities and prices; only existing paid tools are advertised.
- As Community, connect beyond five accepted connections and send more than ten daily messages. No upgrade prompt should interrupt either flow.
- Verify temporary message/request burst errors preserve input and recover after the window on both plans.
- Use Community's actions for two creations and one refinement, then repeat with three creations. The fourth AI action is rejected in both cases. Plus uses the same shared pool with a ceiling of 50.
- After AI exhaustion, edit, duplicate, publish, preview, and repeatedly export an owned lesson in PDF and Word. None should use AI actions.
- Check that suspended users and non-owners cannot export. Verify blocks, unread counts, notifications, and Plus-resource access still behave correctly.
- Check the shared allowance and next reset date on desktop and mobile. Existing usage should survive refresh, downgrade, and rollout.

## Verification on 2026-10-16

- 153 unit/component tests passed across 49 files; 44 emulator integration/rules tests passed.
- The production browser suite covered 76 applicable cases, with 25 intentional project/viewport skips. The final full run passed 75 cases and exposed one draft-fixture collision between browsers. After making the draft text/link unique per account, that test passed on both desktop and mobile in a targeted two-case rerun. All 76 applicable cases therefore have passing evidence; the full suite was not repeated after this test-only fixture change.
- ESLint, strict TypeScript, Prettier, and the optimized production build passed. Pricing was also visually inspected at 1440px and 390px, with no horizontal overflow.
- Firebase tests used a separate demo emulator suite on ports 19099/18080/19199. AI was mocked; these checks do not measure live model quality or costs. No real Stripe payment was made.
