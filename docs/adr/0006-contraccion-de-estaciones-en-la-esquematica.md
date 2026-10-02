# ADR-0006 — Contracción de estaciones en la esquemática

- **Estado:** Aceptada
- **Fecha:** 2026-10-01
- **Story:** 4.6 — _Contraer cada estación en un solo nodo del diagrama_
- **Extiende:** ADR-0005 (no lo contradice)

## Contexto

En una terminal de bus, cada línea recorre las dársenas, da la vuelta y sale.
Esos segmentos internos llegan al grafo de líneas como un subgrafo propio (en
Costa Tijuca `41618` ni siquiera comparten nodo con la calle), y el router
octilineal los dibuja como octágonos y colas que pasan de largo la terminal.

Desde la Story 5.7, Vellum Bridge escribe `stationId` en cada parada de un
edificio de estación (`transit` 1.1). Es la única señal fiable de que dos
paradas son la misma estación: agrupar por nombre o por cercanía inventaría
transbordos.

## Decisión

Antes de derivar la red de la esquemática, `contractSchematicStations` (en
`packages/core/src/transit-network/schematic/station-contraction.ts`) transforma
la `CityData` de forma pura y determinista. `deriveSchematicTransitNetwork` la
encadena con `deriveTransitNetwork`, y solo la usan el worker de escritorio y el
camino síncrono de `useSchematicNetwork`. El mapa geográfico sigue derivando la
red de la `CityData` original.

La regla:

1. **Partes.** Las paradas únicas de una estación se agrupan por _single
   linkage_ con un salto de como máximo 48 m (`STATION_PART_HOP_M`). Una parada
   sin coordenadas finitas no entra en ninguna parte.
2. **Nodos.** Un nodo de ruta pasa a una parte si está a ≤ 48 m
   (`STATION_CONTRACTION_RADIUS_M`) de alguna de sus paradas **y** todas las
   líneas que lo tocan paran en ella. Si alcanza a varias partes, gana la parada
   más cercana y, en empate, el menor id de parte. Una línea que pasa sin parar
   nunca se desvía hacia la estación.
3. **Segmentos.** Un segmento con los dos extremos en la misma parte sale de
   todas las rutas. Uno con un solo extremo (o con extremos en partes distintas)
   se reconecta al nodo central `station:<stationId>:<repId>`, en el centroide
   de la parte, sin los puntos intermedios que caen dentro del radio.
4. **Vueltas.** Si una línea sale de un nodo central y vuelve a él sin parar en
   ningún sitio, ese tramo sale de su ruta y la línea termina en la estación.
   Generaliza el caso de entrar y salir por el mismo radio (que ya resuelve el
   builder de transiciones al omitir la transición de un corredor a sí mismo).
   Se aplica por línea, nunca cruza un hueco de la ruta, se rechaza si alguna
   parada de la línea fuera de la parte está a ≤ 48 m del tramo y nunca deja a
   la línea sin ruta.
5. **Paradas.** Las paradas de una parte se sustituyen por una representante: el
   menor `stop.id`, con su `name` y su `nameDerived`, el `stationId` y la
   posición del centroide. Cada línea conserva su `mode`.

Sin ningún `stationId` (`.cslmap`, `.vellummap` previos a la 5.7), la función
devuelve la misma referencia y el diagrama es idéntico al de antes.

**Opción C (un símbolo por estación).** `canonicalSchematicStops` expone
`stationKey`, el `stationId` común de las entradas de un candidato, y llega hasta
`PlacedStop`. Después del paso 4 de `render.ts`, los símbolos con la misma clave
se fusionan: ancla el de menor `id` (`x`, `y`, `id` y `edgeId` son suyos),
`lineIds` es la unión, `confirmedTransfer` se recalcula con los modos de la unión
y `shape` es la envolvente convexa de las cápsulas. Como la fusión ocurre al
dibujar, al ocultar líneas el símbolo se reconstruye solo con las partes
visibles. La clave es un string, así que la entrada de render sigue pasando por
`postMessage`.

## Alternativas consideradas

- **A. No contraer las estaciones separadas.** Contraer solo las estaciones
  que caben en una parte y dejar las demás como hoy. Las terminales quedarían
  bien, pero el aeropuerto de San Rico y la terminal de ferris seguirían
  dibujándose como dos estaciones sin relación, y eso contradice el
  `stationId` que Bridge escribe precisamente para decir que son una.
- **B. Contraer cada parte con su propio símbolo.** Un nodo central y una
  cápsula por parte. Es lo más simple, pero el lector ve dos estaciones a
  pocos milímetros sin nada que indique que el transbordo es el mismo
  edificio.
- **D. Un único nodo para toda la estación, con un símbolo sobre todos sus
  corredores.** Fusionar las partes en un solo nodo obliga a mover las líneas
  de cada modo hacia un punto común que no existe en la ciudad (65–68 m de
  desplazamiento) y a inventar un símbolo que abrace varios corredores, un
  tipo de símbolo que hoy no tienen ni la UI ni las etiquetas.
- **C. Un nodo por parte y un único símbolo (elegida).** Sebas eligió C el
  2026-10-01: cada línea sigue en su geometría, y la estación se lee como una
  sola cápsula alargada. Es la envolvente convexa de cápsulas que ya existen,
  así que no hace falta otro tipo de símbolo, y la UI y las etiquetas ya leen
  cualquier `shape` cerrado.

## Umbral de 48 m

Es la misma distancia con la que el mapa decide que dos paradas son la misma
estación (`STATION_MERGE_THRESHOLD_M`). En el corpus, el salto más largo entre
paradas vecinas de una terminal de bus es de 9 m (Greenwood, South Holland), 11 m
(Ogden Dunes Harbor) y 40 m (Costa Tijuca `41618`), así que cada terminal queda
en una sola parte. Bob Newbie International Airport (`11692`, metro + bus, 65 m)
y Downtown Ferry Terminal (`15018`, ferry + bus, 68 m) se separan en dos partes y
se dibujan con un único símbolo alargado. La separación total de una terminal
(80–91 m) no distingue nada, y por eso la regla mide saltos y no diámetro.

## Evidencia

`station-contraction.corpus.test.ts` (opt-in con `VELLUM_CONTRACTION_CITY`),
sobre los `.vellummap` del 2026-10-01. Se corrió con las estrategias
geográfica y octilineal, y las cifras fueron idénticas en las dos, por eso la
tabla trae una sola fila por ciudad:

| Ciudad       | Estaciones | Nodos     | Corredores | Nodos centrales | Estaciones con varios símbolos | Símbolos de estaciones |
| ------------ | ---------- | --------- | ---------- | --------------- | ------------------------------ | ---------------------- |
| Costa Tijuca | 33         | 229 → 217 | 352 → 336  | 10              | 1 → 0                          | 34 → 33                |
| San Rico     | 216        | 719 → 656 | 1065 → 987 | 24              | 8 → 0                          | 224 → 216              |

En los dos casos ningún corredor queda dentro de una estación. Sin la regla de
vueltas, San Rico conservaba dos anillos en terminales de monorriel (99 m y
152 m, con el nodo lejano a 49 m y 71 m del andén).

## Consecuencias

- La esquemática y el mapa derivan redes distintas a propósito: la contracción
  es una transformación de la vista y nunca toca `CityData` ni el mapa.
- El número total de símbolos de San Rico no baja (1456 → 1456): al mover la
  parada representante al centroide, algunas paradas de calle que antes
  absorbía la agrupación por cercanía quedan como símbolo propio junto a la
  estación (los candidatos solo de calle pasan de 1232 a 1240 y los mixtos de
  80 a 74). La agrupación por cercanía no cambia; solo cambia su entrada.
- La regla de vueltas es la única que borra recorrido de una línea que no está
  dentro del radio. Está acotada para no tocar líneas que paran en el tramo, y
  si una ciudad la necesita fuera de una terminal, el test de corpus lo
  mostrará como un cambio en las cifras.
