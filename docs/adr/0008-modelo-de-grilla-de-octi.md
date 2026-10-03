# ADR-0008 — El modelo de grilla de `octi` en la esquemática

- **Estado:** Aceptada
- **Fecha:** 2026-10-02
- **Stories:** 4.9 — _Un paso de grilla, un corredor_; 4.10 — _Cobrar los giros
  de una línea en los nodos_
- **Extiende:** ADR-0005, ADR-0006 y ADR-0007 (no las contradice)

## Contexto

El router de la esquemática (`grid-layout.ts`) se inspiraba en `octi` (Bast,
Brosi y Storandt, EuroVis 2020), pero se apartaba de su modelo en puntos que se
veían en el dibujo:

- Solo cobraba 2,5 por reusar una **celda**, así que dos corredores recorrían los
  mismos pasos de la grilla y uno tapaba al otro: 17 pares de corredores
  superpuestos en Villa Coronada y 324 en San Rico.
- Cobraba los quiebres dentro de un corredor, pero no el giro de una línea al
  pasar de un corredor a otro en un nodo. Así salía la «Z» de Child Health
  Center: en Villa Coronada había 15 reversas en nodo y en San Rico 83.
- Fijaba cada nodo en su celda antes de rutear, no respetaba el orden circular
  de los corredores alrededor del nodo, dimensionaba la celda por cantidad de
  nodos y centraba el orthoradial en el centroide.
- No dividía los nodos de más grado que puertos: en el orthoradial, con 4
  puertos por celda, San Rico tenía 3186 pares superpuestos y 305 rutas de
  respaldo.
- Ponía cada parada en su fracción **geográfica** del corredor y escribía los
  nombres a lo largo del rayo, en vertical junto a una línea horizontal.

## Decisión

El router sigue el algoritmo aproximado de `octi`, con la relajación de SSTD 2021
(_Metro Maps on Flexible Base Grids_):

1. **Un paso, un corredor.** Un paso de grilla ya usado, o la diagonal que lo
   cruza en X, cuesta `sharedStepPenalty = 20` pasos. Es un costo finito y no
   infinito (SSTD §3): el router siempre encuentra ruta y cada caso forzado se
   cuenta en `sharedGridSteps`.
2. **Giros en nodo.** Al salir de un nodo, o al llegar a él, cada dirección paga
   `bendCost` por cada corredor ya ruteado del que alguna línea transita a este
   en ese nodo (`network.transitions`). Es el mismo orden de costos que un
   quiebre dentro del corredor (`octi` §4.4, las aristas _sink_).
3. **Nodo durante el ruteo.** Un nodo sin celda se decide en la ruta de su primer
   corredor. Las candidatas son las celdas libres a ≤ 3 celdas de su semilla y
   cuestan `1,5 · d` por desplazamiento; si los dos extremos están sin celda, se
   reparten las candidatas por Voronoi local (`octi` §4.2). Una celda que dejaría
   al nodo, o a un vecino, con menos puertos libres que corredores paga como paso
   compartido.
4. **Orden circular.** Un puerto que rompe el orden geográfico de los corredores
   del nodo, sin dejar puertos libres para los que faltan, paga como paso
   compartido y se cuenta en `orderViolations` (`octi` §4.3).
5. **Tamaño de celda:** `0,5 ·` la mediana de la distancia entre nodos
   adyacentes. No baja de la regla `4√n + 8`, y los topes son 224 celdas por lado
   en el octilineal y 128 anillos en el orthoradial.
6. **Orthoradial:** centrado en el nodo de mayor grado (SSTD §5.2). Un nodo con
   más corredores que puertos se divide (SSTD §2, `node-splitting.ts`): una
   ventana contigua de sus corredores, en orden circular, pasa a un nodo nuevo
   unido por un corredor sintético `split:…`.
7. **Paradas a distancias iguales.** Las paradas de cada corredor se reparten en
   `(i+1)/(k+1)` según su orden geográfico (la «deg-2 heuristic» de `octi`).
8. **Etiquetas de estación:** texto horizontal en una de las 8 posiciones
   octilineales, del mismo lado de la línea que la etiqueta anterior de esa línea
   (`octi` §5).

Si la búsqueda óptima agota su presupuesto, se reintenta con la heurística ×4
antes de recurrir a la línea recta de `lineTo`. Pasar por la celda de otro nodo
deja de estar prohibido: cuesta `2 · sharedStepPenalty`, que es la relajación
de SSTD. Si no, un nodo encerrado en el centro denso caía a la línea recta, que
ignora todo.

### Por qué 0,5 y no el 0,75 del paper

`octi` usa `D = 0,75 · d̄` sobre redes donde ya contrajo las estaciones de grado
2, así que `d̄` es la distancia entre cruces reales. Nuestros nodos son cruces de
calle, mucho más densos. Con 0,75 y tope 112, el centro de San Rico encerraba a
sus nodos: quedaban 221 pasos compartidos, 816 cruces y 3,5 s por layout. Con 0,5
y tope 224 quedan 13 pasos compartidos, 273 cruces y unos 0,7 s. En San Rico la
grilla fina es además más **rápida**, porque cada búsqueda deja de pelear contra
la congestión; en ciudades sin centro congestionado es algo más lenta.
Se usa la mediana porque la media está sesgada por los tramos largos (Villa
Coronada: media 218, mediana 96).

### Por qué las paradas cerca del nodo también se reparten

Se probó dejar en el extremo las paradas a ≤ 48 m de un nodo. Eso apilaba en un
mismo cruce estaciones distintas. En Villa Coronada, los símbolos metidos en el
área del nodo pasaban de 25 a 47 y los pares demasiado juntos de 11 a 21;
repartiéndolas todas quedan en 8 y 11.

## Cifras del corpus (2026-10-02)

`main` (`60bf09b`) → esta rama. Se mide con `grid-model.corpus.test.ts`: las
cifras salen de la geometría, así que el mismo test mide los dos layouts.

**Octilineal**

| Ciudad         | Pares superpuestos | Giros 135° + reversas en nodo | Orden circular | Quiebres rieles | Quiebres bus | Cruces    | Respaldos | ms         |
| -------------- | ------------------ | ----------------------------- | -------------- | --------------- | ------------ | --------- | --------- | ---------- |
| Villa Coronada | 17 → 1             | 48 → 22                       | 21 → 0         | 31 → 32         | 42 → 29      | 12 → 13   | 8 → 0     | 94 → 60    |
| Costa Tijuca   | 29 → 2             | 88 → 33                       | 52 → 4         | 24 → 20         | 291 → 249    | 56 → 72   | 0 → 0     | 54 → 153   |
| Springvalley   | 123 → 6            | 160 → 76                      | 64 → 22        | 198 → 134       | 898 → 515    | 343 → 321 | 15 → 0    | 297 → 620  |
| San Rico       | 324 → 13           | 365 → 179                     | 170 → 30       | 177 → 111       | 1099 → 665   | 432 → 273 | 52 → 0    | 1685 → 756 |

**Orthoradial**

| Ciudad         | Pares superpuestos | Giros 135° + reversas en nodo | Orden circular | Respaldos | ms          |
| -------------- | ------------------ | ----------------------------- | -------------- | --------- | ----------- |
| Villa Coronada | 162 → 7            | 40 → 2                        | 28 → 0         | 35 → 0    | 49 → 35     |
| Costa Tijuca   | 265 → 17           | 67 → 2                        | 88 → 10        | 34 → 0    | 247 → 118   |
| Springvalley   | 753 → 211          | 132 → 16                      | 110 → 36       | 42 → 0    | 604 → 931   |
| San Rico       | 3186 → 424         | 343 → 36                      | 246 → 89       | 305 → 0   | 3489 → 1978 |

Los respaldos de San Rico bajan de 52 a 0. Las paradas metidas en el área del
nodo bajan en las cuatro ciudades (San Rico octilineal: 583 → 482).

## Consecuencias

- **Villa Coronada, tranvía: +1 quiebre (23 → 24).** Es el costo de la 4.10: el
  giro en nodo pasa al corredor. A cambio desaparecen la Z del metro (2 giros de
  135° → 0) y las 4 reversas de tranvía en nodo. Es la única cifra de rieles que
  sube.
- **Lo que empeora además del tranvía.** El tiempo octilineal sube en Costa
  Tijuca (54 → 153 ms) y Springvalley (297 → 620 ms), y el orthoradial de
  Springvalley pasa de 604 a 931 ms. La grilla fina es más rápida solo en San
  Rico, donde la vieja estaba congestionada. Los cruces suben en Villa Coronada
  (12 → 13) y Costa Tijuca (56 → 72): son cruces de verdad entre corredores que
  antes se dibujaban uno encima del otro.
- **Rutas por la celda de otro nodo** (`nodePassThroughs`, la pared relajada):
  San Rico 18 en octilineal y 111 en orthoradial; Springvalley 7 y 70; Villa
  Coronada y Costa Tijuca, 1 a 9. Antes esas rutas caían a la línea recta de
  `lineTo`, que no se contaba.
- **Cifras de nodo con nodos divididos.** En la rama, los giros y el orden
  circular se miden sobre la red ruteada, así que una línea que cruza un hub
  dividido cuenta dos giros (ventana → sintético → resto) y el nodo nuevo tiene
  su propio orden. Las columnas orthoradiales de giros y orden no son del todo
  comparables con `main`; el octilineal del corpus no divide ningún nodo.
- **Los corredores en anillo** (que salen y vuelven al mismo nodo) siguen
  usando el bucle mínimo de antes, sin pasos usados ni orden circular. Son raros
  en el corpus.
- El orthoradial sigue compartiendo pasos en Springvalley (211) y San Rico (424):
  sus anillos interiores tienen pocas celdas y los radios convergen. Hace falta
  una grilla adaptativa (los _Hanan grids_ de SSTD §4.3) o la búsqueda local.
- Un corredor sintético `split:…` es un trazo real de líneas reales, pero no
  existe en la red. Las métricas leen las uniones y las transiciones de la red
  ruteada (`schematicLayoutDiagnostics(layout).network`), y la fidelidad sigue
  medida contra la red original.
- `relocatedNodes` cuenta ahora los nodos que no quedaron en la celda a la que
  se ajusta su semilla, sea por desplazamiento elegido o por choque.
- Diferido: la búsqueda local final (`octi` §4.6) y la penalización de densidad
  por paradas en corredores cortos (§4.7).
