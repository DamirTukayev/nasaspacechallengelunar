# Shared UI foundation

The application uses IBM Plex Sans from local assets for a consistent appearance across computers. Heading weight is 600. The original variable TTF and SIL OFL 1.1 license are preserved in src/assets/fonts; no external font requests or new npm dependencies are required.

Button is a native action control with primary, outline and ghost variants; it defaults to type=button, while forms opt into type=submit. Link remains a native anchor with text, navigation and button-like variants. Explicit external links open a protected new tab and display an external marker; internal links retain normal same-tab navigation. Shared focus, hover, disabled states and control geometry live in styles/controls.css. Normal controls are 44px high and compact controls 36px.

The planner header, Analyze/Compare form actions, Copy link and Mission Control top actions use these primitives. Domain-specific site selectors, playback controls and chart interactions retain their behaviour. MoonLogo uses a cratered moon with a unique SVG gradient id and no coloured arc. Visible product labels use Noctis Horizon; API identity, repository name, storage keys, scenario query links and routing behaviour are unchanged.

About, its team content, assets, route entry and navigation links are a dependent change. Home and dedicated Planner/Mission Control paths remain a subsequent task. This foundation does not introduce those routes or public publishing.

Validation includes a standalone build of this change before the About additions, lint, formatting and the frontend suite. Four new tests check form submission opt-in, disabled actions, internal anchor semantics and explicit external link attributes. Desktop browser checks additionally cover application navigation and control geometry in the combined local preview; no mobile work is part of this revision.

Controls keep square corners in accordance with CONTRIBUTING.md. A real desktop screenshot of this branch is included at docs/images/ui-foundation-desktop.png.

## Noctis colours

Shared colours live in `frontend/src/styles/theme.css`: primary #0b3d91, hover #092f70, tinted surface #e9eef6, focus #2676d9, highlight on dark surfaces #6ea8ff, graphite #171923 and paper #f5f6f8. Buttons, links and selected controls use these tokens. Sun/Earth map ramps and status colours remain separate from the product accent. Contributor guidance describes the Noctis appearance and retains flat controls.

SI indicators and disclosure for the project remain a separate task. This change does not establish full submission compliance.

PR preparation validation: the standalone foundation branch passed the production build, lint, formatting and all 284 tests (36 files). Its desktop browser preview showed the live API status, locally loaded font and square controls, with no About links or browser errors. The included screenshot was captured from that branch.
