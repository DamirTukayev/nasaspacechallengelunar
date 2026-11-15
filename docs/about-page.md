# About page

Local preview: http://localhost:5173/about

The English About page introduces Noctis Horizon, built by Noctis Expelled, for visitors and hackathon judges. It uses light neutral surfaces and the shared Noctis blue accent. The introductory lunar hero is on Home, while About has a compact heading and retains the project, team and source sections. All six people have illustrative astronaut avatars rather than portraits.

Navigation uses ordinary links and direct pathname selection at the frontend entry. `/about` and `/about/` load the page without mounting the planner, querying its API, or loading three.js. Planner and Mission Control use `/planner` and `/mission-control`; old `?show=0`, `?show=1` and shared-scenario links remain compatible. The public pages share their header/footer, and all four screens use the common navigation. On deployment, the web server must serve `index.html` for the client-side page paths. See [site-pages.md](site-pages.md).

Visible application labels and the browser title use Noctis Horizon. The repository identity and backend API title are unchanged. Team role descriptions were agreed in the design interview. GitHub links were matched to confirmed accounts; no handles were inferred for participants without confirmed accounts.

## Sources and visual assets

Source pages opened on 2026-11-14:

- https://ssd.jpl.nasa.gov/horizons/
- https://pds-geosciences.wustl.edu/missions/lro/lola.htm
- https://www.lroc.asu.edu/ (redirects to https://lroc.im-ldi.com/)
- https://svs.gsfc.nasa.gov/4720/

The context link is the 2026 Lunar Landing Site Navigator challenge. The challenge page and submission guide intermittently failed to open during planning; the About page makes no claim of compliance with an unverified submission guide.

`frontend/src/assets/about/lunar-hero.webp` is the Home background: the Moon rendered from NASA data. The surface colour is the LRO LROC colour map from the NASA SVS CGI Moon Kit (`frontend/src/assets/moon/lroc-color-4k.jpg`, public domain), with relief shading from `ldem-relief-1k.jpg`. It is an orthographic view centred on 42°S, 20°E with light from the left; 120 faint stars and the background colour `#07090c` are drawn procedurally. The 1536×1024 frame is encoded as WebP (about 89 KiB). The astronaut illustrations are native SVG components with initials and small suit variations, not likenesses.

## Validation

Desktop is the scope of this revision. Mobile design and physical-device testing are deferred at the user's request. Browser checks cover direct loading, refresh, a trailing slash, title, six participants, asset loading, no backend dependency on About, no horizontal overflow at 1440px, planner entry, return to About and browser Back. Runtime browser errors and failed requests are checked. Current frontend regression tests are the existing repository suite, not newly authored tests for this page.

The local Vite proxy modification predates this feature and is retained for the LAN preview. It should be reviewed separately before preparing a PR. Public deployment and PR creation are pending user review.

Desktop verification result: existing frontend suite 280/280 passed (35 files). Production build, Oxlint and formatting passed; lint warnings from the initial entry implementation were resolved by extracting Page.tsx. Browser checks confirmed six members and avatar assets, no API calls on About, successful direct route/reload/trailing slash, planner link, return link and Back. Screenshots inspected at 1280px and 1440px; 1920px captured. A first Mission Control return check timed out while its lazy scene was loading; an About link was subsequently added to the loading screen as well. No mobile checks run.

Follow-up browser check passed: the About link on the Mission Control loading screen returns to /about, including at 1280px desktop.

### Live Home verification, 2026-11-15

The committed hero asset from PR #70 (`641b53a`) was copied into the combined local
preview and checked on the actual Vite Home page at widths of 1280 and 1920 px.
The image response was HTTP 200, 91276 bytes, 1536 x 1024 pixels, with a SHA-256
matching the source file. Both full-page captures were visually inspected: the
title, buttons and Moon remain separate, with no horizontal overflow. Direct load,
reload, About navigation and return to Home passed without JavaScript errors.
Home made no API or Three.js requests. The combined local preview also passed its
production build, lint and changed-source formatting checks. This verifies the
current preview; the cause of the earlier failed image swap was not established.

## Team and controls revision, 2026-11-15

User requested surname-first display for all six participants. Avatar initials follow that order. Miras confirmed that hosting infrastructure and domain belong in his contribution description. Damir's repository ownership and foundation work were checked against the public repository metadata and initial frontend/backend commits; the card describes that completed work while retaining his Technical Lead & Maintainer role. New GitHub handles yeginbayev-m and Sanzhar0-a were checked through GitHub's public user API. All six cards now link to confirmed profiles with a GitHub icon. Sanzhar's presentation/demo work is explicitly still in progress. The surrounding project explanation retains its previously agreed wording.

Shared Button/Link components preserve native button/form and anchor behaviour. They supply common primary, outline and navigation treatments for About, planner header/actions and Mission Control header. Compact controls use 36px height; normal controls use 44px. Internal navigation has no external-link arrow. Domain-specific playback, site-selector and chart controls retain their existing behaviour. The moon mark is shared between the About and planner headers.

The GitHub mark was obtained from Primer Octicons (https://github.com/primer/octicons/blob/main/icons/mark-github-16.svg). Its MIT license is preserved at frontend/src/components/ui/OCTICONS-LICENSE.txt. No package dependencies were added.

Validation: production build and lint passed; 284 frontend tests passed, comprising the 280 existing tests and four new shared-control behaviour tests. Browser checks passed at desktop widths 1280 and 1440: six ordered names, six profile links/icons, contribution wording, in-progress status, aligned links, no horizontal overflow, actual form-button types and planner/About transitions. Screenshots of the team and shared planner header inspected. No mobile validation or public publication performed.
