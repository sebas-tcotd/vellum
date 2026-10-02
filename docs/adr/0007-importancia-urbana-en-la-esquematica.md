# ADR-0007 — Importancia urbana en la esquemática

- **Estado:** Aceptada
- **Fecha:** 2026-10-02
- **Story:** 4.7 — _Dar prioridad a los rieles en la vista esquemática_
- **Extiende:** ADR-0005 y ADR-0006 (no las contradice)

## Contexto

El router de la esquemática (`grid-layout.ts`) rutea los corredores en orden:
los primeros se quedan con los caminos rectos y los siguientes pagan la
penalización de ocupación. Hasta ahora el orden era el peso del corredor, es
decir, cuántas líneas lleva, así que en una ciudad con muchos buses un corredor
de buses ganaba el camino recto y el metro daba la vuelta. Además, todas las
líneas se dibujaban con el mismo grosor y la misma opacidad, y la etiqueta de
una estación la ganaba la estación con más líneas.

## Decisión

Una sola tabla de **importancia urbana** por modo, `TRANSIT_MODE_IMPORTANCE`
en `packages/core/src/transit-network/schematic/importance.ts`, exportada desde
`@vellum/core`. La leen el orden de ruteo, el peso visual y la prioridad de
etiquetas; ningún consumidor repite niveles.

| Nivel | Modos                                                                |
| ----- | -------------------------------------------------------------------- |
| 5     | Metro                                                                |
| 4     | Tren, Monorriel                                                      |
| 3     | Tranvía, Bus                                                         |
| 2     | Trolebús, Teleférico, Ferry, Helicóptero                             |
| 1     | Dirigible, los tres tours de Parklife, `Unknown`                     |
| fuera | Avión, Barco de pasajeros, Bus interurbano, Bus de evacuación y Taxi |

Es la escala de la ciudad, no la capacidad del vehículo. No es `MODE_PRIORITY`
(`ordering/constants.ts`), que solo desempata el orden lateral dentro de un haz.

**Modos fuera de escala.** `Helicopter`, `Airplane`, `PassengerShip`,
`IntercityBus`, `EvacuationBus` y `Taxi` son ahora `TransitMode` propios (Rust y
TS). Los que valen `null` conectan con el exterior o no son líneas:
`deriveSchematicTransitNetwork` los quita antes de derivar la red
(`withoutOutOfScaleLines`), así que no llegan al layout, ni a la leyenda ni al
filtro de modos. El mapa geográfico los sigue dibujando, con su propio toggle.
Para meter uno en la escala basta con darle un número en la tabla.

**Distinción por nivel de clase (transit 1.2).** El juego exporta con el mismo
`TransportType` líneas de ciudad e interurbanas. Bridge escribe en `transit` 1.2
el `ItemClass.Level` del prefab de cada línea (`classLevel`, `0` = `Level1`), y
`parse_transit_mode` separa `Ship` 0 → `PassengerShip` y 1 → `Ferry`,
`Airplane` 0 → `Airplane` y 1 → `Blimp`, y `Bus` 2 → `IntercityBus`. Sin
`classLevel` (`.cslmap`, `.vellummap` anteriores a 1.2) o con otro valor, el
mapeo es el de siempre (`Ferry`, `Blimp`, `Bus`), sin error. `Helicopter`,
`EvacuationBus` y `Taxi` se reconocen por su `TransportType` en cualquier
formato.

**Orden de ruteo.** Rango entero de un modo: `nivel * 2`, más 1 para el tranvía
si `tramRoutesFirst`. El rango de un corredor es el mayor de sus líneas, y el
orden es rango descendente, después peso descendente y después id. Metro 10,
tren y monorriel 8, tranvía 7 o 6, bus 6.

**Layout por capas.** El orden de ruteo solo no alcanza: si todos los nodos
eligen celda antes de rutear, una parada de bus puede quedarse con la celda por
la que el metro iba a pasar, y como las celdas de nodo bloquean, el metro la
rodea aunque rutee primero. Por eso `gridSchematicLayout` maqueta una **capa por
rango**, de mayor a menor: los nodos de la capa eligen celda y sus corredores
rutean antes de que exista cualquier nodo de una capa inferior. Un nodo de una
capa inferior se queda con la celda donde cae aunque pase por ella una ruta de
arriba; solo si esa celda es de otro nodo se reubica, y entonces prefiere una
celda que no use ninguna ruta. Esquivar también las rutas de arriba se probó y
se descartó: en San Rico empujaba a los buses lejos de su posición (1743
quiebres de bus y 5445 cruces, contra 1099 y 1873). El precio aceptado de esta
variante (B): un nodo de una capa inferior puede quedar sobre el trazo de una
capa superior, por ejemplo la terminal de un bus dibujada encima de una línea de
metro.

**Resolución de la grilla.** `OCTILINEAR_GRID.maxResolution` pasa de 48 a 112.
La regla (`4·⌈√nodos⌉ + 8`) ya pedía 112 para San Rico (656 nodos), pero el
tope la cortaba en 48: los nodos ocupaban el 28 % de las celdas, 472 se
reubicaban y 569 de 987 corredores no encontraban camino entre las celdas de
nodo. No era falta de presupuesto de búsqueda (multiplicarlo por 10 no cambió
nada; las 569 búsquedas terminaban por agotar la frontera). Con 112, San Rico
tarda unos 1,8 s por layout en el worker, frente a 0,3 s.

**Regla del tranvía.** Tranvía y bus comparten nivel. El tranvía rutea primero
si `buses <= 2 ** tranvías`, contando **líneas** de la red que se está
maquetando (la ciudad o la selección de relayout), una vez por layout. Con 31
tranvías o más es verdadero sin calcular la potencia, que desbordaría un entero
de 32 bits. Si es falso, tranvía y bus empatan y decide el peso, que es el
comportamiento de antes entre ellos.

**Escalones visuales.** Se ordenan los niveles distintos de las líneas
**visibles**, del más alto al más bajo, y el escalón de una línea es la posición
de su nivel. Con metro y bus, el bus es escalón 1, no 2; en una ciudad solo de
buses, los buses son escalón 0. Los calcula `render.ts` sobre las líneas
visibles, así que ocultar el metro sube el tren al escalón 0 sin relayout.

| Escalón | Ancho | Opacidad |
| ------- | ----- | -------- |
| 0       | ×1    | 1        |
| 1       | ×0,75 | 0,85     |
| 2       | ×0,55 | 0,7      |
| ≥ 3     | ×0,4  | 0,55     |

Los segmentos, conectores y estaciones salen ordenados del escalón más bajo al
más alto (orden estable), así que los buses pasan por debajo del metro. Una
estación toma el escalón de su línea visible más importante: su grosor a lo
largo de la línea y el margen sobre las ranuras exteriores se escalan con el
mismo factor, y el ancho transversal sigue saliendo de las ranuras. Una parada
de una sola línea sigue siendo un círculo. `SCHEMATIC_LINE_WIDTH` y el espaciado
de ranuras no cambian.

**Tours.** Empiezan ocultos en el filtro de modos de la esquemática (solo ahí;
el mapa no cambia) y «Mostrar todo» los enciende. Encendidos, se dibujan
punteados: guion y hueco son múltiplos (1 y 2) del ancho dibujado, que ya sigue
al zoom, con extremos rectos para que el remate redondeado no alargue cada
guion.

La «opacidad» de la tabla no es `opacity`: la vista mezcla el color de la línea
con el fondo (`color-mix`) en ese porcentaje. Un segmento y su conector se
solapan en cada unión, y dos trazos translúcidos pintarían ahí puntos más
oscuros.

**Etiquetas.** El nivel más alto de las líneas de la estación es la clave
primaria; la prioridad de antes (líneas, transferencia, terminal) desempata.

**Contrato.** `SchematicSegment` gana `tier?` y `dashed?`, y `SchematicStation`
gana `tier?`. Son opcionales y sobreviven a `structuredClone`; un layout sin
ellos se dibuja como antes. El layout sigue siendo determinista.

## Evidencia

`importance.corpus.test.ts` (opt-in con `VELLUM_IMPORTANCE_CITY`) maqueta cada
ciudad en octilineal con el orden de antes (`routingOrder: 'weight'`: una sola
capa, corredor más pesado primero) y con el de esta decisión (capas por rango),
las dos con la grilla de tope 112, e imprime los quiebres por modo
(`bendsByMode`: vértices interiores donde un trazo de corredor gira, sumados por
línea).

| Ciudad         | Líneas                                                       | Tranvía primero | Rieles    | Metro    | Bus        |
| -------------- | ------------------------------------------------------------ | --------------- | --------- | -------- | ---------- |
| Villa Coronada | 5 tranvía, 3 metro, 3 bus, 1 bus turístico, 1 tour a pie     | sí              | 51 → 31   | 28 → 8   | 37 → 42    |
| Costa Tijuca   | 17 bus, 2 metro, 2 tranvía, 1 tren, 1 monorriel              | no              | 33 → 24   | 11 → 3   | 256 → 291  |
| Springvalley   | 40 bus, 11 metro, 11 monorriel, 6 dirigible, 3 tren, 3 ferry | no              | 319 → 177 | 138 → 61 | 396 → 412  |
| San Rico       | 49 bus, 46 metro, 8 tren, 5 monorriel, 4 ferry               | no              | 303 → 177 | 206 → 94 | 659 → 1099 |

La grilla pesa tanto como las capas. Con el tope de 48, San Rico daba 569
rutas de respaldo y 13 114 cruces; con 112 y capas, 52 y 1873. Springvalley
pasa de 2698 cruces a 725. En Villa Coronada, el metro con toda la ciudad
visible queda en 8 quiebres, como el dibujo a mano de Sebas.

El precio lo pagan los buses: quiebran más y, en San Rico, cruzan más (972 →
1873 cruces frente al orden por peso con la misma grilla). Van más finos, más
apagados y por debajo, así que es el intercambio que pide la story.

**Niveles de clase observados** (`transit` 1.2, exportados el 2026-10-02): las 4
líneas `Ship` de San Rico y las 3 de Springvalley traen `classLevel` 1 y son
ferris; las 6 `Airplane` de Springvalley traen 1 y son dirigibles. Los niveles 0
de `Ship` y `Airplane` (barco de pasajeros, avión) y 2 de `Bus` (interurbano) no
aparecen en el corpus y siguen sin validar con el juego.

**Lo que queda pendiente (antes del veredicto v1.0).** Dos causas de
«espagueti» que no son de esta decisión:

- **Pasos de grilla compartidos.** El router cobra 2,5 por reusar una _celda_,
  y casi siempre le sale más barato que desviarse, así que dos corredores
  distintos pueden recorrer los mismos pasos y uno tapa al otro (17 pasos
  compartidos en Villa Coronada). `octi` deja usar cada arista de la grilla a
  un solo corredor.
- **Giros en nodo.** El router cobra los quiebres dentro de un corredor, pero
  no el giro de una línea al pasar de un corredor al siguiente, y por eso
  aparecen zetas como la de Child Health Center en Villa Coronada.

## Consecuencias

- El orden de ruteo, el peso visual y las etiquetas cambian juntos al mover un
  modo en la tabla; no hay otro sitio que decida qué modos excluir.
- La esquemática y el mapa siguen derivando redes distintas: los modos fuera
  de escala solo faltan en la esquemática.
- `.cslmap` y `.vellummap` anteriores a 1.2 siguen leyendo `Ship` como ferry,
  `Airplane` como dirigible y `Bus` como bus; solo los documentos 1.2 separan
  ferry de barco, dirigible de avión y bus de bus interurbano. Lo que sí cambia
  en **cualquier** formato: `EvacuationBus` antes era `Bus` y ahora es su propio
  modo, y `Helicopter` y `Taxi` antes caían en `Unknown`. Los buses de
  evacuación y los taxis dejan de verse en la esquemática (fuera de escala) y
  los tres tienen su propio toggle en el mapa.
- Los layouts de todas las ciudades cambian: las capas y la grilla nueva mueven
  también los corredores de bus. Las ciudades grandes tardan más en maquetarse
  (San Rico, unos 1,8 s en el worker), y el paneo y el zoom no cambian.
- San Rico todavía tiene 52 rutas de respaldo y un centro denso: lo atacan las
  dos stories pendientes (pasos compartidos y giros en nodo), con San Rico como
  vara de medida.
