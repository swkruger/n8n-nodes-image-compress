# n8n Custom Node: Compress Image (using `sharp`)

- Date: 2025-08-28
- Reference: https://github.com/lovell/sharp

## Overview
Build an n8n custom node that compresses images using `sharp`. The node should accept a binary image or a Base64 string, apply optional resizing and metadata stripping, and output the compressed image plus useful compression metadata.

## Requirements
- Inputs
  - Binary file (image) from an n8n binary property
  - Base64-encoded image string
- Options
  - Output format: `jpg | png | webp | avif`
  - Strip metadata (EXIF/ICC): `Yes | No` (default: Yes)
  - Quality: `0–100` (default: 80) — mapped per format
  - Resize:
    - width (optional)
    - height (optional)
    - maintain aspect ratio (boolean, default: true)
- Outputs
  - Compressed image as binary
  - JSON metadata: original size (bytes), new size (bytes), percent reduction

## Behavior Details
- Use `sharp` to process images. See the project for capabilities and performance notes.
- If input is Base64, decode to a `Buffer` before processing.
- Apply `.rotate()` to respect EXIF orientation when present.
- Metadata handling
  - By default, `sharp` strips metadata. Only call `.withMetadata()` when the user selects "No" for Strip metadata.
- Quality mapping
  - JPEG/WebP/AVIF: pass `quality` directly (0–100)
  - PNG: map `quality` (0–100) to `compressionLevel` (0–9) where `compressionLevel = round((100 - quality) * 9 / 100)`, clamped to `[0,9]`. Higher `quality` → lower compression level (faster, larger files). Optionally enable palette when beneficial.
- Resizing
  - When maintain aspect ratio is true (default), use `fit: inside` and allow either width or height (or both) as bounding box.
  - When false, allow explicit width and height with `fit: fill`.
  - Do not enlarge smaller images unless explicitly requested (`withoutEnlargement: true`).
- Output
  - Place the compressed image on the configured binary property (default: `data`) with the correct file extension.
  - Provide JSON metadata with sizes and percent reduction: `percentReduction = ((original - compressed) / original) * 100`.
- Validation & Safety
  - Validate supported formats and presence of an image input.
  - Guard against extremely large inputs with a reasonable default size cap (configurable constant).

## Acceptance Criteria
- Node appears in n8n with clear display name and description.
- Properties include: input source (binary/base64), format, strip metadata, quality, resize options, output property name.
- Handles JPEG, PNG, WebP, AVIF outputs.
- Maintains aspect ratio when requested; supports width-only or height-only.
- Produces correct file extension and binary mime type.
- Outputs JSON with original size, new size, and percent reduction.
- Reasonable defaults: quality 80, strip metadata Yes, maintain aspect ratio Yes.
- Error messages are actionable and non-leaky.
- README includes install/build/use instructions and option explanations.

## Tasks
- [x] Scaffold n8n custom node package (TypeScript, build scripts, structure)
- [x] Define node properties: inputs, output format, quality, resize, strip metadata
- [x] Implement image compression with `sharp` for jpg/png/webp/avif
- [x] Support inputs from binary or base64; output binary + metadata
- [x] Write README with install, build, and n8n usage instructions
- [x] Security review: input validation and safe defaults
- [ ] Release checklist completed

## Release Checklist
- [ ] package name starts with `n8n-nodes-` and includes keyword `n8n-community-node-package`
- [ ] `package.json` contains `n8n.nodes` mapping to built node path
- [ ] `README.md` includes install, usage, options, and standards note
- [ ] `LICENSE` included (MIT)
- [ ] `engines.node` set to supported version (>= 18.17.0)
- [ ] Build succeeds: `npm run build`
- [ ] Dry run pack succeeds: `npm pack`
- [ ] Version updated appropriately (semver)
- [ ] Repository metadata set (repository, bugs, homepage)
- [ ] Publish to npm: `npm publish --access public`

## Notes & Constraints
- `sharp` supports Node-API v9 compatible runtimes per its README; ensure our Node version in n8n environment is compatible.
- Avoid blocking the event loop; rely on `sharp`'s async APIs.
- Keep files < 500 lines and factor helpers where needed.

## Discovered During Work
- (Add any new sub-tasks or changes here as they arise.)
