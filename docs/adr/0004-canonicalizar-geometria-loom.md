# ADR-0004 — Canonicalizar la geometría LOOM en `@vellum/core`

- **Estado:** Aceptada
- **Fecha:** 2026-09-13
- **Story:** 3.2 — _Transportar y fortalecer los corredores LOOM existentes_
- **Supersede:** ADR-0001 D6, únicamente en el corte de ownership de la geometría de tránsito

## Contexto

ADR-0001 D6 llevó el line graph, la ordenación MLNCM-S y las paradas a
`@vellum/core`, pero dejó trims, conectores Bézier, cápsulas y la fórmula de
slots bajo `renderer-webgl`. Como resultado, `TransitNetwork` no era todavía la
proyección completa consumida por mapa y exportación: el adapter debía volver a
combinar la red con `CityData` y decidir offsets.

## Decisión

`deriveTransitNetwork(cityData, extensions?)` deriva una sola vez toda la salida
LOOM y adjunta `renderGeometry` al `TransitNetwork` congelado. La implementación,
sus tipos y sus constantes viven en
`packages/core/src/transit-network/render-geometry/`.

Cada corredor expone slots resueltos `{ lineId, offsetIndex }`. La fórmula
`position - (count - 1) / 2` existe únicamente en core; su desplazamiento físico
continúa siendo `offsetIndex × SLOT_M`. Las estaciones resuelven nombre, color y
modo desde `network.lines`, por lo que la geometría ya no necesita recibir
`CityData` nuevamente.

`renderer-webgl` queda como adapter: convierte `{x,z}` a GeoJSON, registra los
cuatro sources y cinco layers MapLibre existentes, y traduce metros a píxeles.
La exportación consume el mismo payload GeoJSON y los mismos slots canónicos.

## Consecuencias

- Live y export comparten topología, orden, slots, trims, conectores y estaciones.
- Core permanece puro, determinista y libre de MapLibre, React y Tauri.
- `Bus Line` sigue siendo una referencia virtual de ruta y nunca una vía.
- No puede existir otra implementación LOOM ni otra fórmula de offsets en un adapter.
- Cualquier cambio visual intencional exige aprobar una diferencia de baseline;
  este ADR no autoriza regenerar goldens ni cambiar lifecycle o IDs de MapLibre.

## Evidencia

- `packages/core/src/transit-network/loom-parity.test.ts` fija una baseline
  normalizada para corredor compartido, loop con ramales, modos DLC/Unknown y
  referencias virtuales.
- `packages/core/src/transit-network/render-geometry.test.ts` cubre trims,
  conectores, wrap y estaciones.
- `packages/renderer-webgl/src/layers/layer-transit.test.ts` fija sources, layers,
  z-order, offset GPU y aislamiento del adapter.
