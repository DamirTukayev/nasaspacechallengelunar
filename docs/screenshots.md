# README screenshots

The images in [images/readme](images/readme/) were captured on 15 November 2026
from the local application build at commit `656a44d`. Its Git tree is identical
to merged `main` commit `c1924e3`, verified after fetching the repository. The
README update includes that merged revision and preserves the demo deck link
added in `main` commit `1ccf614`.

Capture ran in headless Chromium through Playwright on the team's `desktop` WSL
host, with a 1440 x 1000 CSS-pixel viewport and device scale factor 1. Pages were
saved as full-page JPEGs at quality 85. Analysis uses a 1440 x 1600 viewport capture
to keep its sky panorama, timeline and playback controls together; the calendar
image captures its section.
The source team logo is reused with a display width of 128 pixels in the README.

## Reproduce the views

Start the frontend and backend using the [local setup](../README.md#run-it-locally).
Use the actual backend, with the LOLA DEM and hydrogen data installed. No API
responses, displayed metrics or page content were replaced for these captures.

| Image | Route and actions |
|---|---|
| [Home](images/readme/home.jpg) | Open `/`. |
| [About](images/readme/about.jpg) | Open `/about`. |
| [Analysis](images/readme/analysis.jpg) | Open `/planner`, select **Lunar South Pole**, UTC dates **2026-11-14 00:00** to **2026-12-13 00:00**, and a **1 hour** step. Run **Analyze** with **Day only** selected. |
| [Comparison](images/readme/comparison.jpg) | Compare **Lunar South Pole**, **Mons Malapert** and **IM-1 Odysseus** over that same period and step. Open **Compare** after all three results load. |
| [Calendar](images/readme/landing-calendar.jpg) | From that south-pole analysis, choose **Show the calendar**. Use **As analysed (29.0 d)**, **Next 6 months** and **Verdict**. |
| [Landing search](images/readme/landing-search.jpg) | Open `/planner?tool=landing-search&landing-view=map`. Keep the labelled saved 2027 result, select **Overall score**, and wait for the Moon Trek relief tiles. |
| [Landing walkthrough](images/readme/landing-walkthrough.jpg) | From Landing search, choose **3D walkthrough**, set quality to **Balanced**, and capture its initial **Start** screen. |
| [Mission Control](images/readme/mission-control.jpg) | Open the same south-pole scenario in `/mission-control`. Use **Details & settings**, then **Sky paths, map & quality** to choose **Balanced**. Close the drawer and pause at the end of the period before capturing. |

The analysis, comparison and calendar use responses from the running backend.
Landing search intentionally shows its bundled saved calculation, identified in
the interface as **2027-01-01 - 2028-01-01**: an 80 km radius, 5 km grid and
6-hour sampling step. Its map uses the Moon Trek basemap, whose attribution is
visible in the image. No regional recalculation is implied by that screenshot.

The local environment contains the regional LOLA terrain. Optional NAC surface
assets were not installed for this capture, so the images do not demonstrate
NAC-resolution terrain. Software WebGL rendering was used for the 3D screenshots;
these images are not a hardware performance measurement.

Earlier image files remain available for existing documentation. README references
the new captures in its own directory.
