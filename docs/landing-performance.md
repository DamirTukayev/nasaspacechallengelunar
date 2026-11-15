# Landing walkthrough rendering

Landing search's existing Three.js scene now has Auto, High, Balanced and Simplified
profiles. Balanced starts at a DPR cap of 1.25, a 1024-pixel shadow map and 128 globe
segments; High retains the original DPR cap of 2, 2048-pixel shadows and 192 segments.
Simplified disables shadows and lowers decorative globe/earth detail and star count.
The regional and fine terrain grids and all search results retain their resolution.

Automatic quality reuses the existing Mission Control controller. Frame samples are
taken only during active playback, so the intentional idle cap does not lower quality.
The shared hook accepts an optional initializer; Mission Control retains its default.

The idle orbit renders at most 24 times per second. Hidden tabs cancel pending frames
and pause visible simulation time. Playback ends after the final camera settles;
reset/replay discards the stopped-time gap. Repeated identical idle/final state events
are suppressed. Moving Sun and lander/flag changes update shadows; camera motion alone
reuses them. The supported PCF shadow type replaces the removed PCFSoft variant.

Data replacement releases owned terrain/markers/labels and replaces only the globe
geometry. The moon texture and material are reused. Scene disposal releases shared
resources once and guards late texture callbacks. Per-frame vector and filter-array
allocations are reduced; unchanged dust does not rewrite its vertex buffer.

## Validation

The isolated branch runs 313 frontend tests, including eight timing/resource cases.
Build, lint and formatting run on WSL Debian. Browser checks cover the quality menu,
hidden/finished lifecycle, replay and resource ownership. Hardware FPS improvement is
not established. At 960 by 600 CSS pixels and device DPR 2, Balanced's buffer is
1200 by 750 rather than the original 1920 by 1200, about 61 percent fewer pixels.
The original software-WebGL diagnostic counted 149892 triangles per idle frame;
Balanced with cached shadows counted 72866. These are workload measurements, not a
claim about speed on another device.

Map candidates, request controls and other new search functionality are separate.
