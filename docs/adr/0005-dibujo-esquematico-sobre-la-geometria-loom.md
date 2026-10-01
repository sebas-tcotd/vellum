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

La cámara SVG no cambia la topología. En cambio, cuantiza su escala visual y
vuelve a materializar desde los corredores estratégicos los offsets de slots,
el recorte de nodo, conectores y cápsulas. Así anchura, hueco y marcador cambian
juntos dentro de límites; `vector-effect: non-scaling-stroke` sólo corregiría el
grosor y dejaría horneados los offsets y polígonos, por lo que no es suficiente.
Las paradas parten de `TransitNetwork.transferCandidates`, la misma agrupación
canónica que el mapa, y no de una deduplicación local por `stopId`.

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
- La rematerialización conserva los corredores y bounds y sólo recrea la
  presentación derivada, por lo que no ejecuta el router ni el solver al mover
  el puntero.
- **Escala transitoria durante el gesto (Story 4.5).** La cámara escribe el
  `viewBox` directamente en el SVG, una vez por frame, y sólo entrega la cámara
  a React al terminar el gesto: al soltar el puntero, o tras un breve reposo de
  la rueda (`ZOOM_SETTLE_MS`). Mientras dura un zoom, las métricas —grosor,
  hueco entre slots, cápsulas y tamaño de etiqueta— no se rematerializan: siguen
  en unidades de `viewBox` y por tanto crecen o encogen con él. Antes esa deriva
  se limitaba a un cuarto de octava; ahora se acumula durante todo el gesto,
  hasta 1,18ⁿ tras n ticks seguidos (unas 7× en 12 ticks). Las etiquetas
  conservan además la colocación y las colisiones de la escala anterior, así
  que durante el gesto pueden solaparse o dejar huecos. Al asentarse, la escala
  cuantizada se compromete una vez y se rematerializa una vez: trazos y
  etiquetas vuelven de golpe a su tamaño de pantalla y se recolocan, con un
  salto visible. Es el precio aceptado de no reconciliar el diagrama en cada
  tick; el resultado final es idéntico al de aplicar cada paso por separado.
  Sigue sin usarse `vector-effect: non-scaling-stroke`, por la razón de arriba.
- **Un solo rango de escala para trazo y geometría.** La rematerialización
  acepta el mismo rango que la cámara (`SCHEMATIC_PRESENTATION_SCALE_MIN`/`MAX`,
  0,04–4). Antes se limitaba a 0,35–3 mientras el grosor de línea seguía la
  cámara sin límite: al acercarse, las líneas adelgazaban y las cápsulas de
  estación y los huecos entre slots no, así que las estaciones quedaban enormes
  junto a sus líneas. El borde de la estación y su anillo de foco también se
  escalan con la cámara (variable `--schematic-station-outline`), y la estación
  no usa `outline` de CSS, que en SVG se mide en unidades del `viewBox`.

## Evidencia

- `packages/core/src/transit-network/geometry-kit/geometry-kit.test.ts` fija la
  aritmética compartida, incluida la simetría de las dos perpendiculares.
- `packages/core/src/transit-network/schematic/render.test.ts` cubre offsets,
  recorte, tangencia de conectores en ambos extremos y cápsulas.
- `packages/renderer-webgl/src/layers/layer-transit.test.ts` y los goldens del
  mapa siguen verdes sin regenerarse: la salida geográfica no se movió.
