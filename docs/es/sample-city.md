# Ciudad de muestra incluida

La bienvenida abre **Aurelia del Delta** mediante la misma carga de documentos,
herramientas y exportación PNG/SVG que un archivo propio. La muestra es local y no
necesita conexión. La exportación usa el selector de destino habitual y no modifica
el documento incluido.

## Contenido provisional y procedencia

Aurelia del Delta es una muestra provisional convertida desde una exportación de
CSL Map View. Sustituirla por una ciudad propia exportada con la versión final de
Vellum Bridge que demuestre agua, tránsito y distritos especializados.

El origen es el fixture público del repositorio
`packages/parser-cslmap/fixtures/aurelia-del-delta.cslmap`: exportación de CSL Map
View versión 4.1, generada `3/28/2026 11:56:21 PM`. El conversor existente escribe
`apps/desktop/src-tauri/resources/sample-city/city.vellummap` y lo vuelve a leer
con el lector nativo estricto. Su manifiesto conserva el productor real
`vellum-cslmap-converter` versión `0.1.0`; no se presenta como exportación Bridge.
No se inventaron ni editaron datos de la ciudad. La conversión informa las
advertencias existentes de clase vial desconocida `NExtSmall4LRoad`.

SHA-256:

- Fixture de origen: `f8514b5e3ff8355ad53b7f0ab168a969cca65b1b3e0c735a3e9a1385cc4f496f`.
- Documento incluido (2.415.497 bytes): `11754874347fe7239e2c8d575990abf186f9f5d0c2f862a5c66ad5589ecdd5f9`.

## Reproducción

Desde la raíz del repositorio (PowerShell):

```powershell
New-Item -ItemType Directory -Force apps/desktop/src-tauri/resources/sample-city | Out-Null
cargo run --release --example cslmap_to_vellummap --package parser-cslmap -- packages/parser-cslmap/fixtures/aurelia-del-delta.cslmap apps/desktop/src-tauri/resources/sample-city/city.vellummap
Get-FileHash apps/desktop/src-tauri/resources/sample-city/city.vellummap -Algorithm SHA256
```

El conversor deriva la identidad del snapshot de su entrada; la misma entrada y
el mismo conversor reproducen el documento. Conservar los bytes del fixture original.

La miniatura de bienvenida `apps/desktop/public/sample-city.webp` es un WebP de
640 × 410 derivado de la exportación real del renderizador de Vellum
`packages/renderer-webgl/test/export-goldens/aurelia-del-delta/full-map-1x-white.png`.
El SHA-256 de su origen es
`c96886eed857764e9310d4e18d409ffd7f4b0e55b08fccde2451674f32d74e28`.
Se redimensionó con Pillow 12.3.0, remuestreo Lanczos, calidad WebP 90 y método 6.
Su SHA-256 es `2cb8ef27589b6b9309d816342d6fd17468de6b6b4f2e98679da1166409763ff7`.

Para reproducir la miniatura con Python mediante `uv`:

```powershell
uv run --with Pillow==12.3.0 python -c "from PIL import Image; Image.open('packages/renderer-webgl/test/export-goldens/aurelia-del-delta/full-map-1x-white.png').resize((640,410),Image.Resampling.LANCZOS).save('apps/desktop/public/sample-city.webp',quality=90,method=6)"
```

## Sustitución y validación de la ciudad definitiva

Sustituir juntos el documento y la miniatura; actualizar `SAMPLE_CITY` en
`apps/desktop/src/sample-city.ts` y ambas versiones de idioma de este documento.
Conservar los metadatos reales del productor Bridge final. El glob de recursos de
Tauri y el empaquetador MSIX preservan `resources/sample-city/city.vellummap`; el
código de ejecución solo resuelve y lee ese recurso.

Validar el paquete definitivo instalado sin conexión en Windows limpio: abrir la
muestra, inspeccionar agua, tránsito y distritos especializados, usar capas,
PlaceCard y esquemática, y exportar PNG/SVG a destinos elegidos. Comparar el hash
incluido antes y después de explorar/exportar. Las pruebas provisionales de
desarrollo y empaquetado no son evidencia de validación instalada final ni de
certificación Store.
