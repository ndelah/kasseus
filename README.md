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

The Kindle Paperwhite 11th generation (2021), 10th generation (2018, Paperwhite 4), and 6th generation (2013, Paperwhite 2) can be selected. Selection updates the dimensions, 3D preview, artwork crop, printing notes and STL filename. The model catalog covers Kindle e-reader body revisions from 2007–2026; storage, connectivity and Kids bundles share their underlying body. Other models remain disabled. Catalog measurements are reference dimensions, not manufacturing drawings.

Upload PNG, JPEG or WebP (10 MB maximum). Images are center-cropped locally and never uploaded to a server. Images are simplified locally to two colors in a Web Worker using color clustering and contour tracing. Choose the case color; inspect assembled, pockets and separate views. Orange highlights discarded fine detail. Download a ZIP containing case.stl, inserts.stl and assembly notes; print each STL in its own filament color. Removing the image generates a plain case.

The case mesh is a closed shell in millimetres with 0.35 mm clearance per side, 2.4 mm backing, 1.6 mm walls and a 0.5 mm retaining lip. The lower edge is open for charging and the power button. TPU is intended. This is an untested physical prototype: corner radius, retention, fit and printer tolerance need physical validation. Do not claim production-verified fit.

## Validation

- `npx tsc --noEmit`
- `npx oxlint app components/case-preview.tsx lib tests`
- `npx tsx tests/geometry.test.ts`: plain and relief meshes for all supported models, model-specific depth and artwork crop, charging-edge clearance, filenames, edge manifoldness, winding, nondegenerate faces, positive volume, dimensions and binary STL structure.
- `npm run build`

The starter's full `npm run lint` also scans untouched component-library code with pre-existing lint errors.

## Sources

- Paperwhite 6th generation: https://kindle.s3.amazonaws.com/UserGuide/Paperwhite_V2/Kindle_Paperwhite_V2_UserGuide_AU.pdf (169 × 117 × 9.16 mm, 6-inch display, Micro-USB; pages 6 and 43–44). Uses the guide’s depth rather than the catalog’s rounded 9.1 mm.
- Paperwhite 10th generation: https://images-na.ssl-images-amazon.com/images/I/81-sqj3b5bS.pdf (166.57 × 115.84 × 8.18 mm, 6-inch display, Micro-USB; printed pages 5 and 50). The profile uses these precise dimensions instead of the rounded catalog values.
- Paperwhite 11th generation: https://www.amazon.com.au/Kindle-Paperwhite-16-GB-adjustable/dp/B09TMK7QFX (174.2 × 124.6 × 8.1 mm).
- Historical catalog: https://comparisontabl.es/kindle-e-readers/
- Kindle DX technical details: https://en.wikipedia.org/wiki/Amazon_Kindle_devices

## Sample art

`public/ginkgo.png` was generated once with the built-in image-generation tool. Prompt: “Portrait 3:4 botanical linocut of a single elegant ginkgo branch with fan-shaped leaves in muted terracotta ink on pale warm cream paper. Refined editorial Japanese print aesthetic, hand-carved linocut with subtle ink texture and clear leaf silhouettes. One graceful branch, large graceful negative space, balanced airy portrait composition, full flat artwork with no perspective. No text, signature, watermark, device, case, UI, frame or mockup.”

## Two-color inlays

Manifold WASM cuts 0.8 mm pockets, leaving 1.6 mm of backing. Matching 0.6 mm inserts have 0.2 mm side clearance and a 0.05 mm adhesive allowance; their face sits 0.15 mm below the exterior. These are glue-in parts, not validated snap fits. Cleanup removes features below approximately 1.2 mm width / 4 mm² area; max 80 loose pieces. Grain, gradients and photos are approximated, so inspect the preview. Colors are filament references only.

`npm test` validates all shell models and inlay topology, holes, clearance, color reversal, tiny features, solid-color fallback and STL serialization. Physical fit still requires a test print.

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

To add another model, copy an object from `lib/case-profiles.json`, supply its sourced dimensions and labels, review the corner radius and access needs, then run it with `--profile`. Add the object to the registry after reviewing the generated prototype. Add a catalog row in `lib/models.ts` too if the device is missing there. The current `rounded-back-open-bottom` template supports rounded rectangular bodies with bottom controls. Asymmetric bodies, side buttons, keyboard devices, and unusual taper need a new geometry template or measured cutouts; the tool cannot infer these from height, width and depth alone. A source link records provenance but is not fetched or verified by the CLI.

Validation inspects the actual serialized STL: byte structure, finite coordinates, nondegenerate triangles, paired edges, winding/normals, a single connected shell, positive volume, outer dimensions and the charging opening. It does not certify physical fit or detect every possible surface intersection. The default 7 mm inner corner radius remains an estimate. Print a fit test in flexible TPU before a finished case.

`npm test` also exercises deterministic generation, corrupted STL rejection, batch output and checksums, custom profiles, and failure without partial output for unsupported models. The CLI generates plain shells; use the browser designer for artwork and inlay kits.
