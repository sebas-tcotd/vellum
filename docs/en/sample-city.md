# Bundled sample city

The welcome screen opens **Costa Tijuca** through the same document loader,
map tools and PNG/SVG export flow as a user file. The sample is local and needs no
network connection. Exports use the ordinary destination picker and do not modify
the bundled document.

## Provisional content and provenance

Costa Tijuca is the provisional sample for this PR. Author attribution and
redistribution permission remain to be confirmed before release. Its original
export is `Costa Tijuca 2026-10-01 171705.vellummap`, exported at
`2026-10-01T22:17:05Z` by **Vellum Bridge 0.9.0-experimental**, with export schema
`1.1` and snapshot ID `09670c2e-1fee-4535-91a7-8b0e1da84b0f`.

The export is copied byte for byte to
`apps/desktop/src-tauri/resources/sample-city/city.vellummap`. No city data or
producer metadata was edited. It contains 23 transit lines, 31 districts and
17 special areas, including campuses, parks and industry areas.

Bundled document: **6,388,577 bytes**.
SHA-256: `8b1ac9d4df3bcb4645b554eb44d0c454c8e7e264f499955a46ab022ddc1fbeb3`.

## Checking the bundled export

From the repository root (PowerShell):

```powershell
Get-FileHash apps/desktop/src-tauri/resources/sample-city/city.vellummap -Algorithm SHA256
cargo test --package vellum --test sample_city
```

The integration test reads the actual bundled bytes with the strict native reader
and checks the city identity, terrain, water, roads, buildings, transit, districts
and special areas. The MSIX packaging test checks that the resource survives
packaging unchanged.

## Replacing and validating the final city

Confirm author attribution and redistribution permission, then regenerate the
chosen city with the final Vellum Bridge version. Replace the bundled document
and update `SAMPLE_CITY` in `apps/desktop/src/sample-city.ts`, the integration test
and both language versions of this provenance document. Keep the actual producer
metadata. The Tauri resource glob and MSIX packager preserve
`resources/sample-city/city.vellummap`; runtime code only resolves and reads it.

Validate the final installed package offline on clean Windows: open the sample,
inspect water, transit and specialized districts, use layers, PlaceCard and the
schematic, and export PNG/SVG to selected destinations. Compare the bundled hash
before and after exploration/export. Provisional development and packaging tests
do not count as final installed-package or Store certification evidence.
