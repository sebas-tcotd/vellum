# Backlog de los papers de LOOM / octi

Cuaderno de lectura de los seis papers del grupo de Freiburg (Bast, Brosi,
Storandt) y del paper de Pacific Graphics sobre _mixed metro maps_. No es
documentación de lo que Vellum hace: es la lista de lo que **todavía no hace** y
que los papers resuelven, con el archivo concreto que habría que tocar.

Cada entrada dice: **qué dice el paper**, **qué hace Vellum hoy** y **qué
cambiaría**. Las entradas marcadas ✅ ya están aplicadas (2026-09-22).

## Fuentes

| Clave          | Paper                                                                                                                                                 |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **LOOM-2019**  | Bast, Brosi, Storandt — _Efficient Generation of Geographically Accurate Transit Maps_, ACM TSAS 5(4), art. 25 (versión extendida de SIGSPATIAL 2018) |
| **OCTI-2020**  | Bast, Brosi, Storandt — _Metro Maps on Octilinear Grid Graphs_, EuroVis 2020 / CGF 39(3)                                                              |
| **SSTD-2021**  | Bast, Brosi, Storandt — _Metro Maps on Flexible Base Grids_, SSTD '21                                                                                 |
| **OSM-2023**   | Brosi, Bast — _Large-scale Generation of Transit Maps from OpenStreetMap Data_, The Cartographic Journal 60(4)                                        |
| **MIXED-2022** | Batik, Terziadis, Wang, Nöllenburg, Wu — _Shape-Guided Mixed Metro Map Layout_, CGF 41(7)                                                             |

---

## 0. Lo que ya se aplicó

### ✅ 0.1 Densidad de la rejilla ortorradial (SSTD-2021 §5.2, OCTI-2020 §1.2)

El tamaño de la rejilla no se elige por el número de nodos sino por el **área**:
`X·Y = ⌈A/D²⌉` con `A` el bounding box del line graph y `D` el tamaño de celda
(OCTI-2020 §1.2). OSM-2023 concreta `D` = _distancia media entre estaciones del
grafo de entrada_.

`ringsFor` dimensionaba la rejilla a `capacidad ≥ nº de nodos`, es decir ~1 celda
por nodo. Como A\* bloquea la celda de **todos** los demás nodos durante toda la
búsqueda (`gridSchematicLayout`), no quedaba por dónde enrutar: en Pepper Lake
**119 de 156 corredores caían al fallback** `lineTo`, que ignora la ocupación, y
el resultado se leía como un fallo de _offset_. Ahora la resolución radial es la
misma que la octilineal (`2·√n + 5` anillos ≈ `(4√n+8)/2`).

Medido sobre Pepper Lake: fallbacks 119 → 9, cruces 429 → 64 (la octilineal
tiene 88).

### ✅ 0.2 Etiquetas de línea sólo donde la línea va sola (LOOM-2019 Fig. 1)

En los renders de los papers el nombre de la línea aparece en **el color de la
línea**, en cuerpo pequeño, paralelo al trazo, y **sólo donde ese trazo va solo**
por el corredor: sobre un haz compartido una etiqueta no puede decir a cuál de
los trazos pertenece. Además el rótulo sólo se pone si el tramo recto es más
largo que el texto.

Implementado en `packages/core/src/transit-network/schematic/labels.ts`. La
densidad por zoom sale de la misma geometría: los tamaños están en píxeles de
diseño y se multiplican por la escala de la cámara, así que al acercarse la
huella de una etiqueta se encoge en unidades del viewBox y entran más.

### ✅ 0.3 La visibilidad entra en la etapa de render, no después (LOOM-2019 §5)

Una parada se dibuja como cápsula sobre los _slots_ de las líneas que paran
ahí. Filtrar los arrays ya dibujados dejaba cápsulas flotando sobre corredores
que habían dejado de dibujarse. Ahora `renderSchematic` recibe `visibleLineIds`
y reconstruye la cápsula sobre los slots que sí se dibujan.

---

## 1. Vista esquemática (rejilla + ruteo)

### 1.1 Conjuntos de nodos candidatos en vez de una celda fija — OCTI-2020 §4.2, OSM-2023

**Paper.** Cada estación no se ancla a una celda: se enruta de un **conjunto** `S`
de celdas candidatas dentro de un radio `r` de su posición original a un conjunto
`T`. Si `S` y `T` se solapan se parten con un diagrama de Voronoi local. El coste
de la _sink edge_ de cada candidata lleva una penalización por desplazamiento,
normalizada por el tamaño de celda `D` y multiplicada por el coste de salto más
una penalización de movimiento `c_m`. Los nodos ya "asentados" en una iteración
anterior se fijan (`U = {V(u)}`).

**Vellum hoy.** `gridSchematicLayout` hace `grid.snap(seed)` y, si la celda está
ocupada, busca linealmente la celda libre más cercana sobre `grid.cellCount`
entera. El ruteo nunca puede mejorar esa decisión.

**Cambio.** Sustituir snap+reubicación por ruteo set-to-set con penalización de
desplazamiento en las aristas de entrada/salida. Es el cambio de mayor impacto
que queda en `grid-layout.ts`.

### 1.2 Orden de procesamiento de aristas por _line degree_ — OCTI-2020 §4.1

**Paper.** El orden no es por peso: se define `ldeg(v)` = número de líneas (no
únicas) que pasan por `v`; se marca el nodo de mayor `ldeg` como _dangling_ y se
va creciendo desde ahí, añadiendo las aristas incidentes al nodo colgante de
mayor `ldeg`. El resultado crece de forma conexa desde el centro de la red.

**Vellum hoy.** `routingOrder` ordena por `weight` (nº de líneas del corredor) y
desempata por id. Cada corredor se rutea sin relación con el anterior, así que la
ocupación que ve el segundo no es la de su vecindad sino la de la red entera.

**Cambio.** Reemplazar el `sort` por la construcción _dangling_ del paper.
Barato y no toca la geometría.

### 1.3 Preservar la topología con coste infinito, no con penalización — OSM-2023

**Paper.** En cuanto una _image path_ usa una arista de la rejilla, su coste pasa
a **infinito**; en rejillas no planares (octilineal con diagonales) también se
ponen a infinito las aristas que la cruzan. Además se preserva el **orden
circular** de aristas alrededor de cada nodo poniendo a infinito las sink edges
que lo violarían. Para no quedarse sin solución se usa _constraint relaxation_:
en vez de infinito, un valor fijo muy grande `w∞` (SSTD-2021 §3), de modo que
cualquier camino por aristas conformes sea más barato que uno que viole la
topología.

**Vellum hoy.** `GRID_ROUTER.occupancyPenalty = 2.5` — una penalización blanda.
Los corredores pueden y suelen cruzarse: 64 cruces en Pepper Lake.

**Cambio.** Subir la ocupación a un `w∞` grande (relajación, no infinito duro) y
añadir el bloqueo de diagonales cruzadas en `createOctilinearGrid.neighbors`.
Medible directamente con `metrics.crossings`.

### 1.4 Diagonales ligeramente más caras que su longitud — OSM-2023

**Paper.** Aristas horizontales/verticales pesan 1 y las diagonales **1.5**, "para
no favorecer las diagonales e incluso favorecer ligeramente horizontales y
verticales".

**Vellum hoy.** `cost: step * Math.hypot(dx, dy)` → la diagonal cuesta √2 ≈ 1.414,
que es exactamente su longitud: geométricamente honesto, estéticamente peor.

**Cambio.** Una línea en `octilinear.ts`. Produce diagramas con más tramos
cardinales, que es el idioma de Beck.

### 1.5 Fallback que encoge la rejilla, no que ignora la ocupación — OSM-2023

**Paper.** "Si no se encuentra imagen con el procedimiento anterior, reducimos el
tamaño de celda un 10 % y volvemos a intentar."

**Vellum hoy.** Si A\* falla, `grid.lineTo` traza un camino conforme que ignora
completamente la ocupación — un corredor encima de otros. El número aparece en
`diagnostics.fallbackRoutes` pero el dibujo no dice nada.

**Cambio.** Reintentar la capa entera con una rejilla más fina antes de recurrir
al fallback, y tratar `fallbackRoutes > 0` como lo que es: una violación.

### 1.6 Contracción de nodos de grado 2 — SSTD-2021 §1.2, OSM-2023

**Paper.** Se contraen todos los nodos de grado 2 **antes** de esquematizar y se
reinsertan **equidistantes** sobre el camino final; durante la búsqueda local se
añaden fuerzas de muelle a cada image path para que no queden tan cortos que no
quepan los nodos contraídos. Es la "deg-2 heuristic": reduce el problema y da el
espaciado uniforme característico de los mapas de metro.

**Vellum hoy.** No existe. Las paradas se colocan por fracción de arco del
corredor (`arcFractionOf`), así que heredan el apiñamiento geográfico: en las
capturas se ven cinco paradas pegadas y luego un tramo largo vacío.

**Cambio.** Es el que más cambiaría el _aspecto_ del esquemático. Afecta a
`line-graph` (contracción) y a `render.ts` (reinserción equidistante).

### 1.7 Búsqueda local de pulido — OCTI-2020 §4, OSM-2023

**Paper.** Tras la construcción greedy, mover cada image node a cada una de sus
celdas vecinas libres, re-rutear las aristas adyacentes y quedarse con el mejor
movimiento; repetir hasta que no haya mejora.

**Vellum hoy.** No hay fase de pulido; el resultado del greedy es el final.

**Cambio.** Necesita una función objetivo explícita. `metrics.ts` ya calcula casi
todos los términos (cruces, solapes, desplazamiento), así que el objetivo puede
salir de ahí en vez de inventarse uno nuevo.

### 1.8 Aproximar el trazado geográfico (_octi-geo_) — OSM-2023

**Paper.** Para producir mapas esquemáticos que **conserven el parecido con la
ciudad**, se desplaza el coste de cada arista de la rejilla por la distancia
cuadrática ponderada de esa arista al curso geográfico de la arista de entrada
que se está ruteando.

**Vellum hoy.** La geografía sólo entra como semilla de posición de los nodos; el
ruteo entre ellos no la mira.

**Cambio.** Un cuarto modo de geometría (`octilinear-geo`) al lado de los tres
actuales. Es el que hace que el esquemático siga siendo reconocible como la
ciudad, que es justo lo que se pierde hoy entre `geographic` y `octilinear`.

### 1.9 Nodo central y grado máximo 4 en la rejilla ortorradial — SSTD-2021 §5.2

**Paper.** Los mapas ortorradiales reales tienen un nodo central; el paper lo
conecta a **4** nodos del primer anillo, "de forma ortolineal, para garantizar un
grado máximo de nodo consistente de 4".

**Vellum hoy.** `createOrthoradialGrid` conecta el centro a los 8 radios del
anillo 1.

**Cambio.** Menor, pero abarata el paso por el centro y evita que el centro
actúe como atajo universal.

### 1.10 Distancia mínima garantizada en el anillo interior — SSTD-2021 §5.2

**Paper.** Con radios `r_i = i·d` la distancia entre nodos vecinos del anillo `i`
es `2·r_i·sin(π/b_i)`, que en el anillo 1 vale `(π/4)·d < d`. Para garantizar `d`
el radio interior tendría que ser `(4/π)·d`. El paper lo deja documentado y no lo
aplica ("la diferencia en los mapas resultantes nos pareció marginal").

**Vellum hoy.** `radius = r · ringStep`, o sea el caso no corregido: el anillo 1
tiene 0.765·ringStep entre celdas vecinas.

**Cambio.** `radius = ringStep·(r + 0.307)`. Sólo vale la pena si el anillo
interior vuelve a apretarse; anotado para no volver a derivarlo.

### 1.11 Nodos de grado alto: _node splitting_ — SSTD-2021 §2

**Paper.** Una rejilla octilineal sólo admite grado 8, la hexalineal 6 y la
ortorradial **4**. Para grados mayores se separan las aristas sobrantes a un nodo
no-estación `v'` unido a `v` por una arista nueva `f` con `L(f)` la unión de las
líneas movidas, y se repite si hace falta.

**Vellum hoy.** No existe. Un nodo de grado > 4 en la rejilla ortorradial no
puede dibujarse conforme; hoy eso se absorbe en el fallback.

---

## 2. Mapa normal (geográfico, MapLibre)

### 2.1 Frentes de nodo dinámicos en vez de recorte estático — LOOM-2019 §5, OSM-2023

**Paper.** El área libre de un nodo no es una constante: cada _node front_ se
desplaza **a lo largo de la línea central de su arista hasta que deja de
solaparse** con los de las aristas vecinas, con una distancia máxima como criterio
de parada.

**Vellum hoy.** `render-geometry` y `schematic/render.ts` recortan una distancia
**estática**: `NODE_PAD + (maxSlotCount · SLOT)/2`, topada a `MAX_TRIM_FRACTION =
0.4` del corredor. En un cruce con haces muy desiguales eso abre demasiado de un
lado y demasiado poco del otro.

**Cambio.** Expansión iterativa de los frentes. Afecta a
`render-geometry/builders/corridor-builder.ts` y a `schematic/render.ts` por
igual — es el mismo recorte en los dos.

### 2.2 Fusionar nodos cuyos frentes chocan, y marcador _maestro_ — LOOM-2019 §5

**Paper.** "Una solución es fusionar nodos vecinos si sus frentes chocan durante
la expansión. Para evitar marcadores de estación solapados en mapas de resolución
pequeña, los nodos fusionados podrían dibujarse como un único marcador. La
elección de este marcador **maestro** es cuestión de un ranking de estaciones y
puede basarse, por ejemplo, en el número de líneas que sirven a la estación."

**Vellum hoy.** No hay fusión. En el mapa se ven marcadores solapados a zoom
bajo, y en el esquemático la `minStationDistance` medida sobre Pepper Lake es
**0** (hay cápsulas que se tocan) con 37–47 pares por debajo del umbral.

**Cambio.** Un paso de _merge_ por proximidad en `builders/station-builder.ts`
con ranking por número de líneas. Es la respuesta directa a `tightStationPairs`.

### 2.3 Control de Bézier que aproxima un arco circular — OSM-2023 Fig. 19

**Paper.** Para la conexión interna entre dos puertos `p` y `q`: se muestrea la
dirección de la línea 5 m antes de cada frente, se calculan los segmentos
`t_fuA`, `t_euA` de longitud `|p−q|` en esa dirección; si se cortan en `i`, se
promedian `pi` y `qi` en `δ`, y con `k = 4/3(√2 − 1)` se ponen los controles a
`k·δ` de `p` y `q`. "Una propiedad agradable de esta `k` es que la Bézier cúbica
**aproxima un arco circular** si `i` existe y `pi`, `qi` tienen la misma
longitud." Si no se cortan, los controles van a `k·t_euA` y `k·t_fuA`.

**Vellum hoy.** `BEZIER_ARM_FACTOR = 0.4` sobre la **cuerda**, igual en los dos
extremos. Es tangente en ambos extremos, pero no aproxima un arco: en juntas
asimétricas el codo se nota.

**Cambio.** Tres líneas en `connector-builder.ts` y en
`schematic/render.ts::innerConnection`, y una constante que deja de ser un
número mágico. Nota: `k = 4/3(√2−1) ≈ 0.5523`, no 0.4.

### 2.4 Polígono de estación: buffer del nodo o rectángulo de mínima desviación — LOOM-2019 §5

**Paper.** Para estaciones de grado ≥ 3 el polígono de nodo _buffered_ "ya da
resultados razonables, aunque con mucho margen de mejora"; también probaron
**rotar un rectángulo hasta minimizar la suma de desviaciones** entre la
orientación de cada frente de nodo y la del rectángulo.

**Vellum hoy.** Cápsula perpendicular al corredor (`roundedRectRing`), correcta
para grado 2 y discutible en un cruce de verdad, donde la estación pertenece a
varios corredores con orientaciones distintas.

### 2.5 _Graph untangling_ y pruning antes de ordenar — LOOM-2019 §4

**Paper.** Seis reglas de _untangling_ (Full X, Full Y, Partial Y, Double Y,
Partial Double Y, Stumps) más tres de _pruning_ y dos de _cutting_, aplicadas
iterativamente (Algoritmo 1). Efecto medido: sin untangling, el valor objetivo de
las heurísticas queda **entre 2 y 9 veces peor**; con él, en muchos grafos el
espacio de búsqueda se reduce a 1 (el orden queda determinado sin optimizar).

**Vellum hoy.** `ordering/index.ts` implementa el objetivo MLNCM-S de LOOM con
enumeración exhaustiva + greedy + hill climbing, pero **no** las reglas de
simplificación. Es decir: se corre una heurística sobre el grafo completo, que es
exactamente el caso que el paper mide como 2–9× peor.

**Cambio.** Probablemente la mejora de mayor relación calidad/esfuerzo en todo el
pipeline del mapa normal. Las reglas son locales y puramente sintácticas sobre el
line graph.

### 2.6 Recocido simulado como pulido final del orden — OSM-2023

**Paper.** Tras el greedy, _simulated annealing_ con vecindario = intercambiar un
par de líneas en una arista, `T₀ = 1000`, `T_i = T₀/i`, aceptando empeoramientos
con `exp(−Δθ/T_i)`.

**Vellum hoy.** Hill climbing con `MAX_HILL_CLIMB_PASSES = 8`. LOOM-2019 §6.3
compara ambos: producen órdenes comparables, pero el hill climbing "puede llegar a
costar muchísimo" (8 minutos en Stuttgart) porque explora todo el vecindario.

### 2.7 Pesos del objetivo revisados — LOOM-2019 §6

**Paper.** La versión extendida abandona la penalización uniforme: "mover algunos
cruces o separaciones a estaciones con grado mayor que 2 dio mapas mejores". Los
cruces en `v ∈ S` se penalizan con `w_S×` si `deg(v) = 2`, y con `3·deg(v)`
(cruce normal) o `12·deg(v)` (cruce de par de aristas) en otro caso; las
separaciones con `3·deg(v)` si `deg(v) = 2` y `9·deg(v)` si no.

**Vellum hoy.** `W_CROSS_SAME_SEG = 4`, `W_CROSS_DIFF_SEG = 1`,
`W_SEPARATION = 3`, "todos escalados por `deg(v)`" — los pesos de la versión
**corta** (SIGSPATIAL 2018), no los de la extendida.

### 2.8 Componentes por distancia para redes grandes — OSM-2023

**Paper.** El grafo se parte en _componentes por distancia_ (dos nodos están en la
misma si hay camino entre ellos o su distancia es menor de 10 km) y cada
componente se procesa por separado, porque una rejilla que cubra todo no cabe en
memoria.

**Vellum hoy.** `gridSchematicLayout` construye una rejilla sobre toda la red. En
una ciudad CS1 eso es aceptable; con líneas fuera del mapa se convierte en una
rejilla enorme para nodos muy dispersos.

---

## 3. Etiquetado (pendiente en ambas vistas)

- **SSTD-2021 §1.3.2**: "Las etiquetas de estación se añadieron después de
  encontrar un layout octilineal óptimo" — es decir, incluso los autores lo tratan
  como una etapa _a posteriori_, no como parte de la optimización. Lo que Vellum
  hace ahora está en esa línea.
- **MIXED-2022 §2**: el etiquetado por sí solo es NP-difícil; la referencia
  canónica para hacerlo bien es el marco de Niedermann & Haunert para mapas de
  red. Las etiquetas deben quedar **libres de solape, cerca de su estación y con
  orientaciones consistentes** entre estaciones vecinas — este último criterio es
  el que Vellum todavía no tiene: hoy cada etiqueta elige su lado
  independientemente.
- **MIXED-2022** también cita el enfoque contrario (NW11, WTLY12): meter las
  etiquetas **dentro** del programa de optimización del layout, reservando espacio
  para ellas. Es lo que hace que los mapas reales nunca tengan que abreviar.

---

## 4. Criterios de diseño como checklist (MIXED-2022 §3.2)

Los siete principios del paper, útiles como criterios de aceptación de cualquier
cambio de arriba:

- **D1 Constrained layouts** — orientaciones restringidas (octilineal) y topología
  del grafo de entrada preservada.
- **D2 Precisión topográfica** — las posiciones relativas entre pares de
  estaciones deben conservarse.
- **D3 Estaciones separadas** — distancia mínima entre estaciones,
  preferiblemente uniforme. _(Vellum: `minStationDistance = 0` hoy; §2.2.)_
- **D4 Simplificación de trayectorias** — orientaciones tan continuas como sea
  posible, mínimo número de codos.
- **D5–D7** — específicos del _shape embedding_, no aplicables por ahora.

MIXED-2022 completo (embeber una forma-guía en el trazado, emparejando rutas con
la forma mediante Fréchet direccional) es una idea de producto muy Vellum —
"dibuja tu red siguiendo la silueta del lago" — pero es un proyecto entero, no un
arreglo.
