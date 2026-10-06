# Ciudad de muestra incluida

La bienvenida abre **Costa Tijuca** mediante la misma carga de documentos,
herramientas y exportación PNG/SVG que un archivo propio. La muestra es local y no
necesita conexión. La exportación usa el selector de destino habitual y no modifica
el documento incluido.

## Contenido y procedencia

Costa Tijuca es la ciudad de muestra elegida para v1.0. Antes del lanzamiento hay
que registrar aquí la atribución al autor y el permiso de redistribución; este
documento no los da por confirmados. Su exportación original es `Costa Tijuca 2026-10-01 171705.vellummap`, generada el
`2026-10-01T22:17:05Z` por **Vellum Bridge 0.9.0-experimental**, con esquema de
exportación `1.1` e identidad de snapshot `09670c2e-1fee-4535-91a7-8b0e1da84b0f`.

La exportación se copia byte por byte a
`apps/desktop/src-tauri/resources/sample-city/city.vellummap`. No se editaron datos
de la ciudad ni metadatos del productor. Contiene 23 líneas de tránsito, 31
distritos y 17 áreas especiales, entre ellas campus, parques y áreas industriales.

Documento incluido: **6.388.577 bytes**.
SHA-256: `8b1ac9d4df3bcb4645b554eb44d0c454c8e7e264f499955a46ab022ddc1fbeb3`.

## Comprobación de la exportación incluida

Desde la raíz del repositorio (PowerShell):

```powershell
Get-FileHash apps/desktop/src-tauri/resources/sample-city/city.vellummap -Algorithm SHA256
cargo test --package vellum --test sample_city
```

La prueba de integración lee los bytes incluidos con el lector nativo estricto y
comprueba la identidad de la ciudad, terreno, agua, vías, edificios, tránsito,
distritos y áreas especiales. La prueba de empaquetado MSIX comprueba que el recurso
se conserve sin cambios al empaquetar.

## Validación y sustitución de la ciudad

La exportación incluida es la ciudad elegida para v1.0 y sus bytes están
verificados (SHA-256 arriba, `cargo test --package vellum --test sample_city` y
comprobación del mismo hash dentro del MSIX desempaquetado). Si se decide
regenerarla con la versión final de Vellum Bridge, o sustituirla por otra,
reemplazar el documento y actualizar `SAMPLE_CITY` en `apps/desktop/src/sample-city.ts`, la prueba
de integración y ambas versiones de idioma de este documento. Conservar los
metadatos reales del productor. El glob de recursos de Tauri y el empaquetador MSIX
preservan `resources/sample-city/city.vellummap`; el código de ejecución solo
resuelve y lee ese recurso.

Validar el paquete definitivo instalado sin conexión en Windows limpio: abrir la
muestra, inspeccionar agua, tránsito y distritos especializados, usar capas,
PlaceCard y esquemática, y exportar PNG/SVG a destinos elegidos. Comparar el hash
incluido antes y después de explorar/exportar. Las pruebas provisionales de
desarrollo y empaquetado no son evidencia de validación instalada final ni de
certificación Store.
