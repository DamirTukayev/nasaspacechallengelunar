# Landing search presentations

Landing search stays under `/planner?tool=landing-search`. The existing lunar scene,
fonts, blue accent, shared buttons, header and footer are retained. Two presentations
use the same result:

- **3D walkthrough:** the existing globe, flight, scan and descent at the top-ranked
  site. Camera and Sun motion illustrate the search stages. The displayed metrics
  come from the backend result.
- **Map & candidates:** a south-polar relief map, the five highest-ranked eligible
  sites, their metrics, and links into Analysis and Mission Control. The direct URL
  adds `&landing-view=map`; reload retains this presentation. Switching to the map
  disposes the 3D scene. The map uses a static 2D canvas and imagery, without WebGL.

The map's **Overall score** layer uses the returned `points.total` values on the
fixed 0-1 scale, with the same color ramp as the walkthrough. Each cell represents
one search-grid sample; values are not interpolated or rescaled to the current
maximum. The grid is clipped to the searched disk. Grey cells fail the eligibility
limits, independently of their numeric score; invalid values are left unpainted.
The legend states the grid spacing. Layer choice survives a new search and a visit
to the 3D view, and toggling it does not make a new calculation request.

## Data and periods

Without an incoming Planner scenario, the page opens the explicitly labelled saved
calculation from `public/data/landing-search.json`. Opening the page does not launch
a regional calculation. The bundled example covers 2027, with an 80 km radius, a
5 km grid and a 6-hour time step.

An incoming Planner scenario supplies the initial period and sampling step. Regional
search has a minimum step of one hour, matching its existing API. Search settings
allow the visitor to request dates, radius, spatial grid and time step through the
existing `/api/landing-search` endpoint.

If that request fails, the saved result remains explicitly labelled with its actual
period, radius and grid. A notice explains when those settings differ from the
requested search. Candidate links use the displayed result's period and coordinates;
they preserve existing comparisons and open the details view. Search presentation
and rehearsal parameters do not leak into Analysis or Mission Control.

The calculation still uses the existing LOLA terrain, JPL Horizons ephemerides and
Lunar Prospector hydrogen map. Regional screening uses a coarser horizon model than
the single-site analysis. Hydrogen values and scores are backend outputs; imagery
does not replace the terrain model used in calculations.

## Relief map

The basemap uses the NASA Moon Trek layer `LRO_LOLA_Shade_SPole45_100mp_v04`.
The [official Trek API](https://trek.nasa.gov/tiles/apidoc/trekAPI.html?body=moon)
documents its REST WMTS access. Layer metadata was checked on 2026-11-15 against
the [WMTS capabilities](https://trek.nasa.gov/tiles/Moon/SP/LRO_LOLA_Shade_SPole45_100mp_v04/1.0.0/WMTSCapabilities.xml)
and Moon Trek's polar catalog.

The catalog specifies Moon2000 south-polar stereographic, IAU2000:30120, with a
1737400 m radius, +x toward 90 degrees east and +y toward 0 degrees east. The WMTS
itself advertises EPSG:0, so its catalog projection and tile coordinates are used
explicitly. Level 4 has a 1095930 m top-left origin and a 136991.25 m tile span.
Its display pixel spacing is about 535 m; the product name's 100 m spacing is not
claimed as the resolution of these displayed tiles.

The map shows this attribution. If the imagery is unavailable, it displays a local
visual hillshade from the returned terrain grid and labels that fallback. The
hillshade's apparent light direction is illustrative, not an illumination result.

## Local validation

Builds, tests, backend calculations and Chromium checks run on the SSH host `desktop`
in WSL Debian. Orange Pi holds the working checkout and performs file editing and
transfer. Dependency installation on WSL was explicitly approved.

The final frontend suite passed 328 tests. Build, lint and changed-source formatting
passed on WSL; lint reported zero warnings and zero errors. New cases cover candidate
handoff, saved-result metadata, request encoding, cancellation, direct presentation
links and polar tile placement.

Four additional score-grid tests check cell positions, fixed scores including zero,
eligibility independent of score, and invalid/missing values. WSL Chromium verified
797 cells on the saved example and 13 after a real new search, retained layer state,
candidate selection and the overlay over an intentionally unavailable imagery base.

The browser checks verified actual Moon Trek imagery, candidate selection,
presentation reload, WebGL disposal when switching to the map, and widths of 1280
and 1920 pixels without horizontal overflow. A fallback case deliberately simulated
HTTP 503. The WSL backend also completed a real 2027-01-01 to 2027-01-08 search,
radius 40 km and spacing 20 km: 13 points, 3 eligible. The same request was submitted
through the real form and returned HTTP 200. Detailed analysis returned HTTP 200 for
the selected candidate; Mission Control opened it and retained the search period in
its Planner link. The final browser flow reported no JavaScript errors.

Step labels retain full opacity. Near-opaque panel backgrounds preserve legibility
and avoid the upper-globe occlusion observed with opaque panels in headless Chromium.
Hardware FPS, a mobile redesign, publishing and a new PR are outside this review.
