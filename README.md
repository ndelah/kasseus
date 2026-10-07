# Kasseus

A browser-only Kindle back-case designer built with React, Vinext and Three.js. Start with `npm install` and `npm run dev`; build with `npm run build`. Use Node 22.13 or newer.

## Cloudflare deployment from GitHub

Connect this repository in Cloudflare → Workers & Pages → Create application → Import a repository. Use:

- Worker name: `kasseus`
- Production branch: `main`
- Root directory: `/`
- Build command: `npm run build`
- Deploy command: `npm run deploy`
- Preview deploy command: `npx wrangler versions upload`
- Build environment: `NODE_VERSION=22.16.0`

The Cloudflare Vite plugin writes the deploy configuration during the build; Wrangler automatically picks it up. No runtime secrets or database bindings are needed. Uploads stay in the browser. The Worker URL serves the public app; the source repository can remain private.

## V1

All 38 catalogue models (2007–2026) can be selected and generated as explicitly untested prototypes. The registry records nominal dimensions, evidence, control-access assumptions and contour limitations. [Measurement audit](docs/case-measurements.md) lists every source and conflict; two profiles still use reference dimensions pending a manufacturer/caliper check. Storage, connectivity and Kids bundles require checking the bare-device variant; bundle covers are excluded.

Every model shares vertical exterior walls, a 0.4 mm 45° bottom chamfer, a 0.5 mm rounded upper rim and hook-free low access edges. Optional rear contours affect the cavity only. Default per-side clearance is 0.35 mm and can be overridden per profile. A 2 mm corner radius is a conservative assumption for unmeasured bodies; Paperwhite 10 retains its scan-informed 9 mm contour. Scribe and legacy control edges stay open. The 2026 releases open the top and right edges for relocated power buttons; pogo-pin dock and magnetic accessory compatibility is unverified. Rear speaker/power windows are conservative estimates. Oasis and original Kindle use envelope trays without snap lips; a measured insert or padding may be needed for support and retention. A scan is optional, but dimensions alone do not certify close fit.

The build generates `/cases/catalog.json`, individual plain STLs/reports/notes and `/cases/all-cases.zip`. The model card links to the complete download. These files are regenerated from the registry during every production build.

Upload PNG, JPEG or WebP (10 MB maximum). Images are center-cropped locally, centered on the inset back panel and never uploaded to a server. All artwork uses **Inlaid** designs: images are quantized locally to as many distinct flat colors as the artwork uses, in a Web Worker using color clustering and contour tracing. Choose the case color; inspect assembled, pockets and separate views. Orange highlights discarded fine detail. Download a ZIP containing the printable STLs and assembly notes. Removing the image generates a plain case.

The case mesh is a closed shell in millimetres with 0.35 mm clearance per side, 2.4 mm backing, 1.6 mm walls and a 0.5 mm retaining lip. Profile-specific low edges and rear windows provide access to controls, charging, speakers and pens; verify the estimated windows against the physical device. TPU is intended. This is an untested physical prototype: corner radius, retention, fit and printer tolerance need physical validation. Do not claim production-verified fit.

## Validation

- `npx tsc --noEmit`
- `npx oxlint app components/case-preview.tsx lib tests`
- `npx tsx tests/geometry.test.ts`: plain and relief meshes for all supported models, model-specific depth and artwork crop, charging-edge clearance, filenames, edge manifoldness, winding, nondegenerate faces, positive volume, dimensions and binary STL structure.
- `npx tsx tests/texture-depth.test.ts`: height from shading and lines, watertight sculpted shells, relief budget and single-piece ZIP export.
- `npm run build`

The starter's full `npm run lint` also scans untouched component-library code with pre-existing lint errors.

## Sources

- Paperwhite 6th generation: https://kindle.s3.amazonaws.com/UserGuide/Paperwhite_V2/Kindle_Paperwhite_V2_UserGuide_AU.pdf (169 × 117 × 9.16 mm, 6-inch display, Micro-USB; pages 6 and 43–44). Uses the guide’s depth rather than the catalog’s rounded 9.1 mm.
- Paperwhite 10th generation: https://images-na.ssl-images-amazon.com/images/I/81-sqj3b5bS.pdf (166.57 × 115.84 × 8.18 mm, 6-inch display, Micro-USB; printed pages 5 and 50). The profile uses these precise dimensions instead of the rounded catalog values.
- Paperwhite 11th generation: https://www.amazon.com.au/Kindle-Paperwhite-16-GB-adjustable/dp/B09TMK7QFX (174.2 × 124.6 × 8.1 mm).
- Historical catalog: https://comparisontabl.es/kindle-e-readers/
- Kindle DX technical details: https://kindle.s3.amazonaws.com/Kindle%20DX%20User%27s%20Guide%2C%203rd%20Edition_English.pdf

## Sample art

The studio opens on a planar sample with distinct flat colors to pocket.

- `public/yellow_woodrain_waves.jpg` — default Inlaid artwork: a two-tone yellow wood-grain pattern of stacked vertical waves.

## Color inlays

Manifold WASM cuts 0.8 mm pockets, leaving 1.6 mm of backing. Matching 0.6 mm inserts have 0.2 mm side clearance and a 0.05 mm adhesive allowance; their face sits 0.15 mm below the exterior. These are glue-in parts, not validated snap fits. Cleanup removes features below approximately 0.8 mm width / 1 mm² area. There is no cap on distinct colors or loose pieces; dense patterns export one insert STL per filament. Grain, gradients and photos are approximated, so inspect the preview. Colors are filament references only.

`npm test` validates all shell models and inlay topology, holes, clearance, color reversal, tiny features, solid-color fallback, multi-color palettes, dense piece counts and STL serialization. Physical fit still requires a test print.

## Automated case generator

The app and CLI share `lib/case-profiles.json` and the same case geometry. Profiles contain dimensions, source links, the body template, corner-radius assumptions, and model labels. Adding a profile for an existing catalog model automatically enables it in the selector and batch generator.

```sh
# Show every catalog model and whether it has a case profile
npm run case:generate -- --list

# Generate the Paperwhite 10th generation (2018)
npm run case:generate -- --model paperwhite-2018

# Generate every registered profile, or repeat --model for a subset
npm run case:generate -- --all --out-dir outputs/cases

# Try a new or measured profile without changing the app's supported models
npm run case:generate -- --profile path/to/profile.json
```

Each model gets a directory containing a plain binary STL in millimetres, `report.json` with dimensions, mesh checks and SHA-256, and `PRINT-NOTES.txt`. Repeating a command replaces its generated files. The generator validates the whole selected batch before writing files and refuses unknown models, invalid dimensions, or unsupported body templates. Generated files live under ignored `outputs/`; preserve them separately if needed.

To add a model, supply a sourced entry in `lib/case-profiles.json`, set `openEdges`, describe measurement evidence and contour assumptions, and review a generated fit test. The registry is the single source for the selector and CLI. `rounded-back-open-bottom` supports rounded rectangular cavities with configurable openings; `envelope-tray` preserves an asymmetric device's maximum envelope without pretending to reproduce its contour or retention. Optional back windows must lie inside the floor. Custom profiles can tune `clearance` and `retainingLip`. All exteriors use the same printable rules.

Validation inspects the actual serialized STL: byte structure, finite coordinates, nondegenerate triangles, paired edges, winding/normals, a single connected shell, positive volume, outer dimensions and the charging opening. It does not certify physical fit or detect every possible surface intersection. Unmeasured corner radii and access windows remain estimates. Above-bed downward faces are also checked against a 45-degree overhang limit; this geometric check is not a printer/material certification. Print a fit test in flexible TPU before a finished case.

`npm test` also exercises deterministic generation, corrupted STL rejection, batch output and checksums, custom profiles, and failure without partial output for unsupported models. The CLI generates plain shells; use the browser designer for artwork and inlay kits.
