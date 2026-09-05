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

The Kindle Paperwhite 11th generation (2021) and 6th generation (2013, also called Paperwhite 2) can be selected. Selection updates the dimensions, 3D preview, artwork crop, printing notes and STL filename. The model catalog covers Kindle e-reader body revisions from 2007–2026; storage, connectivity and Kids bundles share their underlying body. Other models remain disabled. Catalog measurements are reference dimensions, not manufacturing drawings.

Upload PNG, JPEG or WebP (10 MB maximum). Images are center-cropped locally and never uploaded to a server. Images are simplified locally to two colors in a Web Worker using color clustering and contour tracing. Choose the case color; inspect assembled, pockets and separate views. Orange highlights discarded fine detail. Download a ZIP containing case.stl, inserts.stl and assembly notes; print each STL in its own filament color. Removing the image generates a plain case.

The case mesh is a closed shell in millimetres with 0.35 mm clearance per side, 2.4 mm backing, 1.6 mm walls and a 0.5 mm retaining lip. The lower edge is open for charging and the power button. TPU is intended. This is an untested physical prototype: corner radius, retention, fit and printer tolerance need physical validation. Do not claim production-verified fit.

## Validation

- `npx tsc --noEmit`
- `npx oxlint app components/case-preview.tsx lib tests`
- `npx tsx tests/geometry.test.ts`: plain and relief meshes for both supported models, model-specific depth and artwork crop, charging-edge clearance, filenames, edge manifoldness, winding, nondegenerate faces, positive volume, dimensions and binary STL structure.
- `npm run build`

The starter's full `npm run lint` also scans untouched component-library code with pre-existing lint errors.

## Sources

- Paperwhite 6th generation: https://kindle.s3.amazonaws.com/UserGuide/Paperwhite_V2/Kindle_Paperwhite_V2_UserGuide_AU.pdf (169 × 117 × 9.16 mm, 6-inch display, Micro-USB; pages 6 and 43–44). Uses the guide’s depth rather than the catalog’s rounded 9.1 mm.
- Paperwhite 11th generation: https://www.amazon.com.au/Kindle-Paperwhite-16-GB-adjustable/dp/B09TMK7QFX (174.2 × 124.6 × 8.1 mm).
- Historical catalog: https://comparisontabl.es/kindle-e-readers/
- Kindle DX technical details: https://en.wikipedia.org/wiki/Amazon_Kindle_devices

## Sample art

`public/ginkgo.png` was generated once with the built-in image-generation tool. Prompt: “Portrait 3:4 botanical linocut of a single elegant ginkgo branch with fan-shaped leaves in muted terracotta ink on pale warm cream paper. Refined editorial Japanese print aesthetic, hand-carved linocut with subtle ink texture and clear leaf silhouettes. One graceful branch, large graceful negative space, balanced airy portrait composition, full flat artwork with no perspective. No text, signature, watermark, device, case, UI, frame or mockup.”

## Two-color inlays

Manifold WASM cuts 0.8 mm pockets, leaving 1.6 mm of backing. Matching 0.6 mm inserts have 0.2 mm side clearance and a 0.05 mm adhesive allowance; their face sits 0.15 mm below the exterior. These are glue-in parts, not validated snap fits. Cleanup removes features below approximately 1.2 mm width / 4 mm² area; max 80 loose pieces. Grain, gradients and photos are approximated, so inspect the preview. Colors are filament references only.

`npm test` validates both shell models and inlay topology, holes, clearance, color reversal, tiny features, solid-color fallback and STL serialization. Physical fit still requires a test print.
