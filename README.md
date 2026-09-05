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

Only the Kindle Paperwhite 11th generation (2021) can be selected. The model catalog covers Kindle e-reader body revisions from 2007–2026; storage, connectivity and Kids bundles share their underlying body. Other models remain disabled. Catalog measurements are reference dimensions, not manufacturing drawings.

Upload PNG, JPEG or WebP (10 MB maximum). Images are center-cropped locally and never uploaded to a server. Darkness becomes up to 0.65 mm raised relief. The Artwork view includes color for reference; the Print preview and binary STL represent actual monochrome geometry. Removing the image generates a plain case.

The exported mesh is a single closed shell in millimetres with 0.35 mm clearance per side, 1.8 mm backing, 1.6 mm walls and a 0.5 mm retaining lip. The lower edge is open for charging and the power button. TPU is intended. This is an untested physical prototype: corner radius, retention, fit and printer tolerance need physical validation. Do not claim production-verified fit.

## Validation

- `npx tsc --noEmit`
- `npx oxlint app components/case-preview.tsx lib tests`
- `npx tsx tests/geometry.test.ts`: plain and relief meshes, edge manifoldness, winding, nondegenerate faces, positive volume, dimensions and binary STL structure.
- `npm run build`

The starter's full `npm run lint` also scans untouched component-library code with pre-existing lint errors.

## Sources

- Supported model: https://www.amazon.com.au/Kindle-Paperwhite-16-GB-adjustable/dp/B09TMK7QFX (174.2 × 124.6 × 8.1 mm).
- Historical catalog: https://comparisontabl.es/kindle-e-readers/
- Kindle DX technical details: https://en.wikipedia.org/wiki/Amazon_Kindle_devices

## Sample art

`public/ginkgo.png` was generated once with the built-in image-generation tool. Prompt: “Portrait 3:4 botanical linocut of a single elegant ginkgo branch with fan-shaped leaves in muted terracotta ink on pale warm cream paper. Refined editorial Japanese print aesthetic, hand-carved linocut with subtle ink texture and clear leaf silhouettes. One graceful branch, large graceful negative space, balanced airy portrait composition, full flat artwork with no perspective. No text, signature, watermark, device, case, UI, frame or mockup.”
