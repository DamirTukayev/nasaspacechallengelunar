# Mission Control: quality and globe markers

## Manual exploration and explicit playback

An ordinary `/mission-control` entry opens the whole Moon with time paused and
the full-period metrics available. It skips the flight, landing and skyline
presentation. Markers can be selected immediately; Landing site and Whole Moon
switch the view without waiting for an introduction.

Demo and the Home page's Watch demo link explicitly start the automatic show.
Stop demo returns to the current scenario's whole-Moon view, with its original
period and time paused at the start. Explore Moon also interrupts an explicitly
started landing or flight, including during scene preparation. Stopping removes
the demo flag from the URL, so refresh stays in manual mode. Manual marker and
tab selections update the scenario URL while preserving other query parameters.

Watch landing and Replay from Moon explicitly start the animated presentation.
In manual mode, Play/Pause controls only the selected time; the camera remains
available for exploration. In the automatic show, the existing guided progression
and scene changes remain available until stopped.

## Quality lasts for the session

The quality controller belongs to Mission Control, above the individual scene.
Switching sites, advancing the demo and replaying a scene retain the manual
profile and the automatic controller's current quality. Leaving Mission Control
ends that session.

Auto starts at Balanced, or Simplified when the existing device hints indicate
limited resources. It still uses the existing adaptive algorithm. A confirmed
reduction carries over to the next site; unfinished probes and partial slow-frame
windows are discarded at scene changes. Manual High, Balanced and Simplified
remain manual throughout the session.

Frame-rate measurements pause during the flight, landing, skyline and sky-path
introductions, horizon/nearby requests, texture loading and detailed terrain
requests. Sampling starts after a fresh two-second warmup once the scene settles.
Hidden-tab intervals and long interruptions also reset that warmup. Loading time
therefore does not become a steady-state FPS measurement.

The profiles change rendering detail, shadows and visual overlays. The backend
analysis, dates, ephemerides and visibility metrics are unchanged. This change
stabilizes quality selection; it does not establish a hardware FPS improvement.

## Globe markers

In Whole Moon and the approach view, catalog markers are projected onto a DOM
overlay. The visible circles remain 10 CSS pixels, or 14 for the selected site,
with a 28-pixel native button target. Projection hides far-side and off-screen
anchors, suppresses overlapping targets in favour of the selected site, and hides
overview markers within 200 km of the surface.

Hover or keyboard focus shows the site name and coordinates. The selected site's
name remains visible. Native Enter and Space activation belongs to the marker,
without triggering Mission Control's playback shortcut. Pointer presses on the
buttons do not begin an orbit drag.

Selecting a catalog marker stops the automatic demo, creates that site's scenario
with the currently displayed start, end and sampling step, and opens it in Mission
Control. The existing loading status and retry UI cover the new analysis and
terrain request. The selection also appears in the top site controls and in the
Planner navigation link. Other catalog sites can be selected even when they were
absent from the original four showcase tabs.

## Local validation

Work and browser checks run on the existing WSL `desktop` preview. No dependencies
were added. The full frontend suite passed 337 tests, including five projection
cases and four session/measurement regression cases. Production build, type
checking and lint passed. Browser checks cover the actual backend and native
marker controls; software WebGL is used, without a hardware benchmark claim.

Chromium verified the real automatic demo transition from the south pole to
Mons Malapert with manual Simplified retained. Mouse selection opened
Chandrayaan-3, and native Enter selection opened IM-1, preserving the displayed
2026-11-14 to 2026-12-13 period and hourly step. Manual Balanced survived a site
remount. Selecting a marker during the demo stopped it and retained that demo
scene's dates. Analysis responses returned HTTP 200, the marker layer was removed
on exit to Planner, and the completed flow reported no JavaScript errors.

A follow-up regression flow explicitly enabled normal motion rather than reduced
motion. It checked ordinary entry, manual terrain/overview switching, interrupting
a landing, stopping a direct `?demo=1` entry, Explore Moon during a running demo,
marker selection and reload. Each stopped/manual view retained the same displayed
time and marker position across a 3.5-second observation. No JavaScript errors or
horizontal overflow were reported. The full 337-test suite, build and lint passed
again after the manual-entry correction.

Before publishing, the branch was updated from `main` at `72b986c`. Its backend
and frontend changes were copied into the WSL preview and the backend restarted.
The refreshed frontend suite passed 339 tests, with build, type checking, lint
and changed-source formatting passing. The normal-motion manual-entry/stop/reload
browser flow passed again against this refreshed version without JavaScript
errors or horizontal overflow.

To review locally, start the project using the README and open
`/mission-control?s=south-pole,2026-11-14T00:00,2026-12-13T00:00,60`.
The overview should already be paused. Hover a marker and select a different site. Check the Planner
link for the same dates. Choose a manual profile under Details & settings, switch
sites, replay, and run Demo to check that the profile remains selected.

Screenshots: [paused overview](images/mission-control/overview.jpg) and
[marker name and coordinates](images/mission-control/markers.jpg).
