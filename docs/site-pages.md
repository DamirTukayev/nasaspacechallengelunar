# Site pages

Local preview base: `http://localhost:5173`.

| Address | Purpose |
| --- | --- |
| `/` | Project introduction, decorative lunar hero, Watch demo and Open planner |
| `/about` | Project approach, six confirmed team profiles, sources and limitations |
| `/planner` | Scenario form, analysis and comparison |
| `/planner?tool=landing-search` | Landing Search within Planner |
| `/mission-control` | Interactive lunar visualization |
| `/mission-control?demo=1` | Explicit entry into the automatic demonstration |

Home is the default for a plain visit, regardless of the previously stored tool mode. Home and About are lazy pages that do not mount the planner, request its backend, or load the 3D scene. The existing decorative hero is reused on Home; About has a compact heading. Team names, profiles and contribution text are retained.

`SiteHeader`, `SiteNavigation` and `SiteFooter` provide shared navigation and product links. The public header is light; the planner uses the same header with a dark workspace variant. Mission Control keeps its specialized HUD and uses the same navigation in compact form. Its loading screen also provides navigation. While Mission Control is open, the planner header and content are not rendered behind it. Source and footer links use the shared Link component. No shadcn/ui or new dependencies are introduced.

## Existing links and browser behaviour

Native anchors perform page navigation. The browser handles Back, Forward, opening a new tab and copying a destination. Analysis state is passed in the existing `s`, repeated `c` and `v` query parameters, using the existing scenario encoder/decoder. The Planner navigation link in Mission Control selects the site currently on screen and retains comparisons. The duplicate Open planner button was removed from its header; Demo and Fullscreen remain actions. The end-of-demo planner action and Escape shortcut are retained.

Old root links with `show`, `demo`, `s` or `c` continue to open their tools. Once the site catalog is available, the tool replaces the current address with its dedicated path and serialized state, without adding a history entry. Until then, the incoming search string is retained in navigation links. Explicit `/planner` and `/mission-control` paths take precedence over conflicting old mode flags. Both tool paths and About accept trailing slashes. Unknown page paths show a navigation page explaining that the address was not found.

The automatic show starts from Watch demo or a `demo=1` link. A plain Mission Control link opens the interactive visualization without starting the automatic multi-site demo. The explicit demo flag is retained on reload.

## Planner tools

Planner provides an Analysis / Landing search navigation row. The selected tool is part of the address, so Landing Search supports direct entry, reload and browser history. It is no longer a temporary local toggle or a separate action in the global header. The Planner item in the site navigation remains selected in both tools.

Switching tools retains the active analysis, compared scenarios and result tab in the existing query parameters. These parameters restore the analysis when returning; the Landing Search calculation continues to use its existing search dataset and is not filtered by the analysis form. The existing positive `t` rehearsal offset is retained only in Landing Search. Tool and rehearsal parameters are removed when navigating to the regular analysis or Mission Control.

## Verification and scope

Twenty-one new entry-link and state-preservation tests cover dedicated paths, old links, repeated comparison parameters, custom coordinates, explicit demo intent and Planner tool navigation. The frontend suite passed all 305 tests, comprising the preceding 284 and these 21 additions.

Desktop layout checks passed at 1280, 1440 and 1920px for Home, About and Planner, with no horizontal overflow or clipped checked containers. Local screenshots are under `/tmp/noctis-preview/pages-*`. Production build, lint and formatting passed. Browser checks verified Home/ About without API or 3D requests, direct loads/reloads, Back/Forward, explicit demo launch, legacy links and restoration of a selected site with two comparisons through Mission Control. The Mission Control header was checked at all three desktop widths, with its site selectors in one row. Offline checks verified that incoming scenario links survive an unavailable catalog and that the loading screen can navigate to About.

Browser validation used split runs. The broad flow completed its live navigation/demo checks, then its initial offline fixture failed because an overly broad interception pattern also blocked Vite source modules. The offline checks passed separately with interception restricted to the actual `/api/` and `/health` endpoints. An earlier live run timed out during replacement of a loading HUD; the live block passed with an explicit scene-loading wait in the subsequent run. Screenshots of Home, About, Planner and Mission Control were visually inspected.

Mobile redesign, SI indicators/disclosure and publication are separate tasks. The existing LAN Vite proxy is preserved. For future deployment, the frontend server must serve `index.html` for the client-side page paths. This local revision does not update production or the existing foundation PR.

Header follow-up: removed only the duplicate top Open planner button and its unused HUD prop. Production build, lint and changed-file formatting passed. A targeted real-browser check selected a different landing site, followed the remaining Planner link, and confirmed the selected site and both comparisons in Planner without browser errors. Demo/Fullscreen remain available; the new header screenshot is in the ignored local preview assets.

Landing Search follow-up: verified direct tool entry, refresh, Back/Forward, two-level active navigation, restoration of the selected analysis and two comparisons, and retention of the existing `t=40` rehearsal offset after the catalog loads. No browser errors occurred. The global header no longer has a separate Landing search action; the Planner tools row exposes both views. Start and Replay use the shared Button component, with scoped contrast/typography fixes and a scene height that accounts for tool navigation. Build, lint and formatting passed after this UI follow-up.

Local data limitation: GET /api/landing-search returns 503 with "No hydrogen map; run python -m app.scripts.fetch_resources". The existing loader falls back to public/data/landing-search.json and labels it Precomputed / offline. The navigation checks used that precomputed fallback; live landing-search recomputation was not verified and no resources were downloaded for this revision.

Final Landing Search visual check passed at 1280, 1440 and 1920px without horizontal overflow. Start was enabled, used the shared blue/white primary treatment and fit within the first 1000px-high viewport; the scene title was light on its dark background. The actual source was precomputed, with no browser errors. The final 1440px screenshot was visually inspected and copied into ignored local preview assets at /about-preview/landing-search-planner.png.
