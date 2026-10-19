# Marketing interactions

Home, Pricing, About, and Help share a perspective card deck. The selected card stays fully visible while the other cards recede behind it. The deck has no horizontal scrolling strip or cropped neighboring card. Pricing plans retain their side-by-side comparison and aligned buttons.

## Interaction and structure

- Previous/next buttons and named card selectors control the deck. Focus the card list to use Left/Right, Home, and End; horizontal touch or pen swipes also change cards without taking over vertical page scrolling.
- Exposed rear cards lift on hover or keyboard focus and have named buttons that bring them forward. Selection returns focus to the deck; hidden article links remain unavailable until selected. Reduced motion retains border and shadow feedback without lifting.
- CSS perspective, translation on the Z axis, and rotation create depth. Advancing moves the previous card backward and brings the next card forward. There is no timed rotation that interrupts reading.
- Each deck is a named region with a semantic list of articles and real headings. Position changes use a polite live region. Inactive card articles are `inert` and `aria-hidden`, so their links cannot receive focus and their content is not announced alongside the selected card.
- Controls have visible focus rings and 44px targets. The current selector uses `aria-current`, and arrow controls disable at the endpoints.
- Reduced-motion preferences replace the animated perspective transitions with an immediate static stack and disable entry animation and icon rotation.
- The server reserves the same deck geometry used after hydration. With JavaScript disabled, a `noscript` stylesheet restores a readable list of all cards and hides unavailable controls.
- Client components receive serializable card data or server-rendered children. There are no new animation dependencies, data requests, or subscription changes.

About presents the platform's three principles and an invitation to join. Help offers account, privacy, and membership topic cards with relevant links. All eight Help questions remain available below the deck through native `details`/`summary` disclosures, followed by the existing contact form. Essential support content is not placed behind card navigation.

The behavior follows the principles in the [WAI carousel tutorial](https://www.w3.org/WAI/tutorials/carousels/): meaningful structure, keyboard access, user control, and announced state changes. Automated checks do not replace testing with assistive technologies.

## Verification on 2026-10-19

- 18 desktop/mobile Chromium checks have passing evidence (16 existing cases plus two focused rear-card cases): all four decks, arrows and selectors, keyboard controls, reduced motion, accessibility scans, swipe handling, complete foreground frames, inactive-card focus restrictions, Help actions/answers, a JavaScript-disabled fallback, and rear-card hover/click/keyboard selection. The new cases passed after correcting pointer targeting and keeping the hit area stable during the lift.
- Four existing marketing/navigation cases have passing evidence. One desktop signup-navigation expectation timed out on the first development run and passed on a targeted rerun; the other three cases passed in the initial run.
- Visual checks at 1440px and 390px confirmed the layered appearance and uncropped card outlines. Normal-motion transitions use actual 3D transforms, while reduced motion retains a static composition.
- ESLint, strict TypeScript, formatting, and the optimized production build passed.

To repeat the focused checks against the running app:

```powershell
$env:PLAYWRIGHT_BASE_URL = 'http://localhost:3000'
pnpm exec playwright test tests/e2e/marketing-motion.spec.ts --timeout=60000
```
