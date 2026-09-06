# Kindle Paperwhite Gen 10 scan measurements

Source: `/Users/ndelahou/Downloads/KindleScan.ply`, supplied by the user. Original creator: PrintedForFun, https://www.printables.com/model/1699495-kindle-paperwhite-gen-10-tpu-bumper-and-3d-scan . Listing identifies the files as CC BY-NC 4.0. Analysis performed 2026-09-06.

The PLY contains 603,477 vertices and 1,206,753 triangles. It has no explicit unit metadata; millimetres are inferred from the device-sized coordinates. Original coordinate bounds span 115.80 × 166.83 × 8.87 mm. The last value includes all surface irregularities and should not be treated as nominal device thickness.

The scan's X/Y axes already follow the width/height. Depth measurements use a robust reference plane fitted to two front bezel strips (49 < |X| < 52 mm, |Y| < 55 mm). A small plane slope is subtracted from Z; X/Y coordinates are retained. The central rear surface is approximately 7.76 mm behind this reference. The center of the scanned front lies below the bezel, so it was deliberately excluded from the depth reference. This could include scanning effects and is not a validated screen-recess measurement.

Cross-sections through the triangle mesh were fitted with symmetric rounded rectangles using robust least squares. Approximate fitted dimensions at depths below the front bezel:

- 2 mm: 115.64 × 166.27 mm, corner radius 8.86 mm.
- 4 mm: 114.58 × 165.09 mm, corner radius 8.17 mm.
- 5 mm: 113.10 × 163.50 mm, corner radius 7.54 mm.
- 6 mm: 110.77 × 161.05 mm, corner radius 7.16 mm.
- 7 mm: 106.44 × 156.41 mm, corner radius 5.60 mm.

The changing width and height show a curved rear roll-off rather than a straight vertical wall or a single linear taper. At 7 mm depth, the outline is inset approximately 4.60 mm per side and 4.93 mm per end relative to the 2 mm section. Radius values summarize all four corners; they are not exact independent corner radii. Ports, surface noise, damage and shape asymmetry produce residuals: median absolute error is about 0.03–0.20 mm at the listed depths, but the 95th percentile reaches about 1.3 mm. Fit residuals are not scanner accuracy estimates.

For the case generator, use approximately 9 mm as a starting radius near the widest outline and a sequence of narrowing outlines for the back, followed by a physical fit test. Do not substitute the full 8.87 mm scan extent for nominal thickness without checking the device. The generator now uses these measurements as described below.

`cross-sections.png` shows measured contours and enlarged side profiles at equal axis scale. `measurements.json` contains numeric results. `analyze.py` reproduces them using NumPy, SciPy and Matplotlib. The original scan remains at the supplied path.

## Generator implementation

Updated `lib/case-profiles.json` and the shared `lib/case-geometry.ts` generator. Only Paperwhite Gen 10 receives scan-derived curvature. Gen 6 and Gen 11 retain their previous assumptions because this scan provides no measurements for them.

- Published dimensions remain 115.84 × 166.57 × 8.18 mm.
- The main corner radius is now 9 mm.
- Rear sections use relative narrowing from the 2 mm section. Scan depths are scaled by 8.18 / 7.76 to preserve published thickness.
- The final measured insets (4.60 mm per side and 4.93 mm per end) are held to the rear plane, leaving additional room beneath the last part of the rounded back. The final 5.60 mm corner radius is likewise held.
- Both exterior and cavity use connected outline layers. The exterior keeps a smaller flat back for bed placement. Layers adjacent to the charging opening are compressed below the low rim.
- The inner loft stops 0.20 mm below the front plane to meet the existing retaining lip without coincident surfaces. Clearance remains 0.35 mm per side, with a 2.4 mm backing.
- These are piecewise linear approximations between measured sections, not an exact reconstruction of the noisy scan or a certified physical fit.

All three supported models were regenerated with `npm run case:generate -- --all`. Geometry, relief, inlay exports, serialized STL checks, and cavity cross-section regression checks passed, along with TypeScript checking and the production build. Each STL has an accompanying validation report and printing notes in `outputs/cases/<model-id>/`.
