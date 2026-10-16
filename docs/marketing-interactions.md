# Marketing interactions

The homepage toolkit and pricing allowance explanations use a shared, manually controlled card carousel. Pricing plans retain their side-by-side comparison and aligned buttons. Billing questions use native `details`/`summary` disclosure elements.

## Interaction and structure

- Native horizontal scrolling and CSS scroll snap support touch swipes and trackpads. Previous/next buttons and card selectors also work with keyboard activation. Focus the card list to use Left/Right, Home, and End.
- Each carousel is a named region with a semantic list of articles and real headings. Position updates use a polite live region. The current selector is marked with `aria-current`; controls have visible focus rings and 44px targets.
- Cards move when the visitor navigates them. There is no timed rotation that interrupts reading. Scroll-entry animations run once per section and use opacity/translation without changing layout dimensions.
- `prefers-reduced-motion` disables entry motion, icon rotation, and smooth scrolling. Content is visible before enhancement; the card content and FAQ remain usable without JavaScript.
- Client components receive plain serializable card data or server-rendered children. There are no new animation dependencies, data requests, or subscription changes.

The behavior follows the principles in the [WAI carousel tutorial](https://www.w3.org/WAI/tutorials/carousels/): meaningful structure, keyboard access, user control, and announced state changes. Automated checks do not replace testing with assistive technologies.

## Verification

- Six new desktop/mobile Chromium browser tests cover arrow controls, selectors, keyboard navigation, reduced motion, accessibility checks, and native FAQ expansion.
- The existing marketing and release checks were also exercised: 21 applicable public browser cases have passing evidence, with one project-specific skip. Two protected-route cases exceeded the development server's 30-second timeout during the broader run; both passed in a targeted rerun with a 90-second timeout (13.2 seconds total).
- Manual checks at 1440px, 768px, and 390px verified normal-motion transitions, carousel navigation, no page overflow, and retained plan-button alignment. Card content and FAQ expansion were also checked with JavaScript disabled.
- ESLint, strict TypeScript, formatting, and the optimized production build passed.

To repeat the focused checks against the running app:

```powershell
$env:PLAYWRIGHT_BASE_URL = 'http://localhost:3000'
pnpm exec playwright test tests/e2e/marketing-motion.spec.ts
```
