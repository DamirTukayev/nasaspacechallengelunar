# Shared UI foundation

The application uses IBM Plex Sans from local assets for a consistent appearance across computers. Heading weight is 600. The original variable TTF and SIL OFL 1.1 license are preserved in src/assets/fonts; no external font requests or new npm dependencies are required.

Button is a native action control with primary, outline and ghost variants; it defaults to type=button, while forms opt into type=submit. Link remains a native anchor with text, navigation and button-like variants. Explicit external links open a protected new tab and display an external marker; internal links retain normal same-tab navigation. Shared focus, hover, disabled states and control geometry live in styles/controls.css. Normal controls are 44px high and compact controls 36px.

The planner header, Analyze/Compare form actions, Copy link and Mission Control top actions use these primitives. Domain-specific site selectors, playback controls and chart interactions retain their behaviour. MoonLogo uses a cratered moon with a unique SVG gradient id and no coloured arc. Visible product labels use Noctis Horizon; API identity, repository name, storage keys, scenario query links and routing behaviour are unchanged.

About, its team content, assets, route entry and navigation links are a dependent change. Home and dedicated Planner/Mission Control paths remain a subsequent task. This foundation does not introduce those routes or public publishing.

Validation includes a standalone build of this change before the About additions, lint, formatting and the frontend suite. Four new tests check form submission opt-in, disabled actions, internal anchor semantics and explicit external link attributes. Desktop browser checks additionally cover application navigation and control geometry in the combined local preview; no mobile work is part of this revision.

## Noctis visual identity, 2026-11-15

The shared palette lives in `frontend/src/styles/theme.css`: primary #0b3d91, hover #092f70, tinted surface #e9eef6, focus #2676d9, highlight on dark surfaces #6ea8ff, graphite #171923 and paper #f5f6f8. Buttons, navigation, selected controls and supporting links use these tokens. The cratered moon mark has no arc. About avatar suit accents follow the palette, and cards have the same flat corners as the rest of the interface. IBM Plex Sans and the page composition are retained. Sun/Earth map ramps and status colours remain separate from the product accent.

Validation of the selected blue palette: production build, lint, formatting and all 284 frontend tests passed. Browser checks confirmed the primary action on About and Planner, darker hover, matching profile links and avatar accent, the moon mark without its arc, no horizontal overflow at 1440px and no browser errors. The preceding desktop layout checks at 1280, 1440 and 1920px passed; selecting blue changes colours only. Mobile checks and scientific regression tests were not run for this visual revision.

SI indicators and disclosure are deferred to a separate task. This local design revision does not establish full submission compliance. The foundation change is reviewed separately from About. The local Vite proxy and the separate PR1 worktree are preserved outside this commit.

The standalone foundation branch also passed the production build, lint, formatting and all 284 tests. Its desktop screenshot is at `docs/images/ui-foundation-desktop.png`; that preview contains the shared controls and no About navigation.
