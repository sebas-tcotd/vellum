# ADR-0005 — Dibujo esquemático sobre la geometría LOOM

- **Estado:** Aceptada
- **Fecha:** 2026-09-20
- **Story:** 4.3b — _Dibujar el esquemático con las reglas de LOOM_
- **Extiende:** ADR-0004 (no lo contradice)

## Contexto

ADR-0004 dejó toda la geometría LOOM en `@vellum/core` y prohibió que existiera
otra implementación de la fórmula de offsets. Esa decisión se tomó con un único
consumidor: el mapa geográfico, donde MapLibre aplica el desplazamiento en GPU a
partir del `offsetIndex` y core nunca materializa las líneas paralelas.

La vista esquemática no tiene GPU que le resuelva eso: dibuja SVG en un viewBox
de 1000 unidades. Sin materializar el offset, todas las líneas de un corredor se
dibujan encima unas de otras y sólo se ve el color de la última. Además sus
coordenadas son `{x, y}` con la `y` creciendo hacia abajo, mientras el mapa usa
`{x, z}` con `z` hacia el norte.

## Decisión

La aritmética adimensional de LOOM vive una sola vez en
`packages/core/src/transit-network/geometry-kit/`, sobre un `Vec2` sin unidades
ni marco: `slotOffsetIndex`, longitud y recorte de polilíneas, proyección,
`roundedRectRing`, `cubicBezier` y **las dos** perpendiculares, `perpCW` y
`perpCCW`, sin que ninguna se llame «derecha».

`render-geometry/` pasa a ser un adaptador `CsPoint` sobre el kit y conserva su
salida intacta. El esquemático añade una **segunda etapa de dibujo** —
`schematic/render.ts`— que materializa en CPU lo que el mapa delega en la GPU:
offset por slot, recorte en los nodos, conectores y cápsulas de estación.

Los slots y su orden siguen viniendo de `lineOrder` (MLNCM-S). El esquemático no
decide ordenación ni recalcula offsets: aplica los que core ya resolvió.

## Consecuencias

- Sigue habiendo **una sola** fórmula de offsets, en el kit. Lo que se duplicó
  no es la regla sino su aplicación, y sólo porque un consumidor no tiene GPU.
- Nombrar una mano es responsabilidad de cada marco: el mapa elige la que
  coincide con `line-offset` de MapLibre, el SVG la contraria. Elegir mal espeja
  el dibujo en silencio, así que hay un test cuyo único trabajo es comparar
  ambas manos.
- Las constantes métricas (`SLOT_M`, `NODE_PAD_M`, grosores de estación) no se
  importan en el esquemático: se derivan a unidades de viewBox desde su ancho de
  línea, de modo que la proporción entre carril, separación y cápsula es la misma
  en las dos vistas.
- Los conectores esquemáticos son Bézier cúbicas, igual que en el mapa. LOOM
  prefiere arcos para mapas esquemáticos (§5, Fig. 26.3), pero un arco único sólo
  puede ser tangente en uno de sus dos extremos y el biarc de radios iguales que
  lo arregla eligió ramas que dibujaban lazos fuera del área del nodo. La Bézier
  es tangente en ambos extremos por construcción y no abandona la envolvente de
  sus puntos de control.
- Cualquier cambio en el kit afecta a las dos vistas a la vez: por eso tiene un
  test de caracterización propio.

## Evidencia

- `packages/core/src/transit-network/geometry-kit/geometry-kit.test.ts` fija la
  aritmética compartida, incluida la simetría de las dos perpendiculares.
- `packages/core/src/transit-network/schematic/render.test.ts` cubre offsets,
  recorte, tangencia de conectores en ambos extremos y cápsulas.
- `packages/renderer-webgl/src/layers/layer-transit.test.ts` y los goldens del
  mapa siguen verdes sin regenerarse: la salida geográfica no se movió.
