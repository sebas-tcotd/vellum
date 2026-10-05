# Bundled sample city

The welcome screen opens **Aurelia del Delta** through the same document loader,
map tools and PNG/SVG export flow as a user file. The sample is local and needs no
network connection. Exports use the ordinary destination picker and do not modify
the bundled document.

## Provisional content and provenance

Aurelia del Delta is a provisional sample converted from a CSL Map View export.
Replace it with an owned city exported by the final Vellum Bridge version that
demonstrates water, transit and specialized districts.

The source is the public repository fixture
`packages/parser-cslmap/fixtures/aurelia-del-delta.cslmap`: CSL Map View export
version 4.1, generated `3/28/2026 11:56:21 PM`. The existing converter writes
`apps/desktop/src-tauri/resources/sample-city/city.vellummap` and reads it back
with the strict native reader. Its manifest retains the actual producer
`vellum-cslmap-converter` version `0.1.0`; it is not presented as a Bridge export.
No city data was invented or edited. Conversion reports existing unknown-road
class warnings for `NExtSmall4LRoad`.

SHA-256:

- Source fixture: `f8514b5e3ff8355ad53b7f0ab168a969cca65b1b3e0c735a3e9a1385cc4f496f`.
- Bundled document (2,415,497 bytes): `11754874347fe7239e2c8d575990abf186f9f5d0c2f862a5c66ad5589ecdd5f9`.

## Reproduction

From the repository root (PowerShell):

```powershell
New-Item -ItemType Directory -Force apps/desktop/src-tauri/resources/sample-city | Out-Null
cargo run --release --example cslmap_to_vellummap --package parser-cslmap -- packages/parser-cslmap/fixtures/aurelia-del-delta.cslmap apps/desktop/src-tauri/resources/sample-city/city.vellummap
Get-FileHash apps/desktop/src-tauri/resources/sample-city/city.vellummap -Algorithm SHA256
```

The converter derives snapshot identity from its input, so unchanged input and
converter reproduce the document. Keep the source fixture bytes unchanged.

The welcome thumbnail `apps/desktop/public/sample-city.webp` is a 640 × 410 WebP
derived from the real Vellum renderer export
`packages/renderer-webgl/test/export-goldens/aurelia-del-delta/full-map-1x-white.png`.
Its source SHA-256 is
`c96886eed857764e9310d4e18d409ffd7f4b0e55b08fccde2451674f32d74e28`.
It was resized with Pillow 12.3.0, Lanczos resampling, WebP quality 90 and method 6.
Its SHA-256 is `2cb8ef27589b6b9309d816342d6fd17468de6b6b4f2e98679da1166409763ff7`.

To reproduce the thumbnail with Python through `uv`:

```powershell
uv run --with Pillow==12.3.0 python -c "from PIL import Image; Image.open('packages/renderer-webgl/test/export-goldens/aurelia-del-delta/full-map-1x-white.png').resize((640,410),Image.Resampling.LANCZOS).save('apps/desktop/public/sample-city.webp',quality=90,method=6)"
```

## Replacing and validating the final city

Replace the bundled document and thumbnail together, then update `SAMPLE_CITY`
in `apps/desktop/src/sample-city.ts` and both language versions of this provenance
document. Keep the actual final Bridge producer metadata. The Tauri resource glob
and MSIX packager preserve `resources/sample-city/city.vellummap`; runtime code
only resolves and reads this resource.

Validate the final installed package offline on clean Windows: open the sample,
inspect water, transit and specialized districts, use layers, PlaceCard and the
schematic, and export PNG/SVG to selected destinations. Compare the bundled hash
before and after exploration/export. Provisional development and packaging tests
do not count as final installed-package or Store certification evidence.
