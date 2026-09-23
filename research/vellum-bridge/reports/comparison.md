# Comparación Vellum Bridge / CSLMap

Corpus: 21 entradas
Pares comparados: 10
Capturas pendientes: 6
No comparables: 0

| Ciudad | Estado | Raw | CSLMap |
|---|---|---|---|
| altavento | ready-for-capture | pendiente | ../../packages/parser-cslmap/fixtures/altavento.cslmap |
| altavento-2026-09-22 | comparison-complete | snapshots/snapshot-20260922T225426988Z.json | cslmap/Altavento-20260922-175423.cslmap |
| aurelia-del-delta | ready-for-capture | pendiente | ../../packages/parser-cslmap/fixtures/aurelia-del-delta.cslmap |
| aurelia-del-delta-2026-09-22 | comparison-complete | snapshots/snapshot-20260922T233858243Z.json | cslmap/aurelia-del-delta-20260922-183856.cslmap |
| fährimperium | ready-for-capture | pendiente | ../../packages/parser-cslmap/fixtures/fährimperium.cslmap |
| fährimperium-2026-09-22 | comparison-complete | snapshots/snapshot-20260922T232524727Z.json | cslmap/fährimperium-20260922-182521.cslmap |
| island-hopping | ready-for-capture | pendiente | ../../packages/parser-cslmap/fixtures/island-hopping.cslmap |
| island-hopping-2026-09-22 | comparison-complete | snapshots/snapshot-20260922T232229677Z.json | cslmap/island-hopping-20260922-182227.cslmap |
| pepper-lake | ready-for-capture | pendiente | ../../packages/parser-cslmap/fixtures/pepper-lake.cslmap |
| pepper-lake-2026-09-22 | comparison-complete | snapshots/snapshot-20260922T231948675Z.json | cslmap/pepper-lake-20260922-181945.cslmap |
| verkehrsbehebung | ready-for-capture | pendiente | ../../packages/parser-cslmap/fixtures/verkehrsbehebung.cslmap |
| verkehrsbehebung-2026-09-22 | comparison-complete | snapshots/snapshot-20260922T232806721Z.json | cslmap/verkehrsbehebung-20260922-182805.cslmap |
| costa-tijuca-2026-09-22 | comparison-complete | snapshots/snapshot-20260922T233112848Z.json | cslmap/costa-tijuca-20260922-183110.cslmap |
| san-rico-2026-09-22 | comparison-complete | snapshots/snapshot-20260922T231028303Z.json | cslmap/san-rico-20260922-181024.cslmap |
| springvalley-2026-09-22 | comparison-complete | snapshots/snapshot-20260922T231529589Z.json | cslmap/springvalley-20260922-181527.cslmap |
| westdale-2026-09-22 | comparison-complete | snapshots/snapshot-20260922T233511006Z.json | cslmap/westdale-20260922-183508.cslmap |
| corrupted | excluded-synthetic | pendiente | ../../packages/parser-cslmap/fixtures/corrupted.cslmap |
| minimal-valid | excluded-synthetic | pendiente | ../../packages/parser-cslmap/fixtures/minimal-valid.cslmap |
| unknown-dlc-assets | excluded-synthetic | pendiente | ../../packages/parser-cslmap/fixtures/unknown-dlc-assets.cslmap |
| with-transit-paths-debug | excluded-synthetic | pendiente | ../../packages/parser-cslmap/fixtures/with-transit-paths-debug.cslmap |
| with-transit | excluded-synthetic | pendiente | ../../packages/parser-cslmap/fixtures/with-transit.cslmap |

Las categorías estructurales no implican equivalencia semántica. `unresolved` requiere revisión humana.

## Resumen del corpus

Pares: 10 (10 capturas parciales)

| Dominio | Ciudades con raw | Ciudades con .cslmap | Conteo raw (mín–máx) |
|---|---:|---:|---|
| roads | 10 | 10 | 2658–31430 |
| transit | 10 | 10 | 0–113 |
| buildings | 10 | 10 | 1551–46888 |
| districts | 10 | 10 | 1–90 |
| vegetation | 10 | 10 | 541–262143 |
| parks | 10 | 10 | 0–17 |
| terrain | 10 | 10 | — |
| water | 0 | 10 | — |

Tránsito (líneas con paradas): 308 líneas, 308 en .cslmap, 306 con la ruta .cslmap contenida en el camino crudo (excepciones: altavento-2026-09-22#103, springvalley-2026-09-22#250); 6 tramos sin camino.
Paradas sobre calle con nombre: 2693 de 3686 (73 %).
Etiquetas .cslmap de districts dentro de su área raw: 217 de 227.
Etiquetas .cslmap de parks dentro de su área raw: 36 de 36.

| No soportado / error | Ciudades |
|---|---:|
| water | 10 |
| dlcs | 10 |
| mods | 10 |

## altavento-2026-09-22

Captura: parcial
Dominios no soportados: water, dlcs, mods

| Dominio | Categoría | Conteo raw |
|---|---|---:|
| roads | unresolved | 4040 |
| transit | unresolved | 4 |
| buildings | unresolved | 2773 |
| districts | unresolved | 1 |
| vegetation | unresolved | 94652 |
| parks | unresolved | 6 |
| terrain | unresolved | — |
| water | unresolved | — |

### Rutas de tránsito

| ID | Línea | Paradas | En calle con nombre | Tramos | Sin ruta | Posiciones raw | Posiciones .cslmap | Misma secuencia | .cslmap ⊂ raw | Solapamiento | Segmentos .cslmap inexistentes |
|---:|---|---:|---:|---:|---:|---:|---:|---|---|---:|---:|
| 3 | Bus Line 2 | 16 | 16 | 16 | 0 | 84 | 68 | no | sí | 1 | 0 |
| 103 | Bus Line 1 | 20 | 20 | 20 | 0 | 284 | 270 | no | no | 0.99 | 2 |
| 173 | Tram Line 1 | 15 | 15 | 15 | 0 | 160 | 145 | no | sí | 1 | 0 |
| 220 | Bus Line 0 | 0 | 0 | 0 | 0 | 0 | 0 | sí | sí | 1 | 0 |

### Geometría de districts

| ID | Nombre | Celdas | km² | Polígonos | Huecos | Etiqueta .cslmap dentro |
|---:|---|---:|---:|---:|---:|---|
| 127 | Centro Histórico | 4476 | 1.65 | 1 | 0 | sí |

### Geometría de parks

| ID | Nombre | Celdas | km² | Polígonos | Huecos | Etiqueta .cslmap dentro |
|---:|---|---:|---:|---:|---:|---|
| 122 | Altavento Institute | 918 | 0.338 | 1 | 0 | sí |
| 123 | King College | 986 | 0.363 | 1 | 0 | sí |
| 124 | Sterling Land | 4883 | 1.8 | 1 | 0 | sí |
| 125 | Parque Mi Bonito Recuerdo | 80 | 0.029 | 1 | 0 | sí |
| 126 | Dale Woods | 1754 | 0.647 | 1 | 0 | sí |
| 127 | Parque Juanita | 92 | 0.034 | 1 | 0 | sí |

## aurelia-del-delta-2026-09-22

Captura: parcial
Dominios no soportados: water, dlcs, mods

| Dominio | Categoría | Conteo raw |
|---|---|---:|
| roads | unresolved | 2658 |
| transit | unresolved | 6 |
| buildings | unresolved | 1551 |
| districts | unresolved | 1 |
| vegetation | unresolved | 100278 |
| parks | unresolved | 0 |
| terrain | unresolved | — |
| water | unresolved | — |

### Rutas de tránsito

| ID | Línea | Paradas | En calle con nombre | Tramos | Sin ruta | Posiciones raw | Posiciones .cslmap | Misma secuencia | .cslmap ⊂ raw | Solapamiento | Segmentos .cslmap inexistentes |
|---:|---|---:|---:|---:|---:|---:|---:|---|---|---:|---:|
| 17 | L3-CCW | 10 | 9 | 10 | 2 | 48 | 40 | no | sí | 1 | 0 |
| 81 | L3-CW | 9 | 8 | 9 | 2 | 46 | 39 | no | sí | 1 | 0 |
| 96 | L1-CCW | 7 | 7 | 7 | 0 | 49 | 42 | no | sí | 1 | 0 |
| 178 | Bus Line 0 | 0 | 0 | 0 | 0 | 0 | 0 | sí | sí | 1 | 0 |
| 197 | L1-CW | 8 | 8 | 8 | 0 | 55 | 47 | no | sí | 1 | 0 |
| 234 | L2 | 7 | 7 | 7 | 0 | 81 | 74 | no | sí | 1 | 0 |

### Geometría de districts

| ID | Nombre | Celdas | km² | Polígonos | Huecos | Etiqueta .cslmap dentro |
|---:|---|---:|---:|---:|---:|---|
| 127 | Woodland Square | 2085 | 0.769 | 2 | 0 | sí |

### Geometría de parks

| ID | Nombre | Celdas | km² | Polígonos | Huecos | Etiqueta .cslmap dentro |
|---:|---|---:|---:|---:|---:|---|

## fährimperium-2026-09-22

Captura: parcial
Dominios no soportados: water, dlcs, mods

| Dominio | Categoría | Conteo raw |
|---|---|---:|
| roads | unresolved | 2865 |
| transit | unresolved | 14 |
| buildings | unresolved | 2396 |
| districts | unresolved | 1 |
| vegetation | unresolved | 192963 |
| parks | unresolved | 0 |
| terrain | unresolved | — |
| water | unresolved | — |

### Rutas de tránsito

| ID | Línea | Paradas | En calle con nombre | Tramos | Sin ruta | Posiciones raw | Posiciones .cslmap | Misma secuencia | .cslmap ⊂ raw | Solapamiento | Segmentos .cslmap inexistentes |
|---:|---|---:|---:|---:|---:|---:|---:|---|---|---:|---:|
| 25 | Bus Line 1 | 9 | 9 | 9 | 0 | 52 | 43 | no | sí | 1 | 0 |
| 34 | Ferry Line 1 | 10 | 0 | 10 | 0 | 148 | 138 | no | sí | 1 | 0 |
| 43 | Bus Line 11 | 8 | 8 | 8 | 0 | 53 | 45 | no | sí | 1 | 0 |
| 56 | Bus Line 2 | 9 | 9 | 9 | 0 | 65 | 56 | no | sí | 1 | 0 |
| 95 | Bus Line 7 | 8 | 8 | 8 | 0 | 50 | 42 | no | sí | 1 | 0 |
| 98 | Bus Line 0 | 0 | 0 | 0 | 0 | 0 | 0 | sí | sí | 1 | 0 |
| 106 | Bus Line 9 | 7 | 7 | 7 | 0 | 41 | 34 | no | sí | 1 | 0 |
| 115 | Ferry Line 2 | 4 | 0 | 4 | 0 | 52 | 48 | no | sí | 1 | 0 |
| 145 | Bus Line 4 | 9 | 9 | 9 | 0 | 50 | 41 | no | sí | 1 | 0 |
| 148 | Bus Line 5 | 9 | 9 | 9 | 0 | 49 | 40 | no | sí | 1 | 0 |
| 196 | Bus Line 8 | 7 | 7 | 7 | 0 | 41 | 34 | no | sí | 1 | 0 |
| 210 | Bus Line 6 | 8 | 8 | 8 | 0 | 50 | 42 | no | sí | 1 | 0 |
| 231 | Bus Line 3 | 9 | 9 | 9 | 0 | 65 | 56 | no | sí | 1 | 0 |
| 233 | Bus Line 10 | 8 | 8 | 8 | 0 | 53 | 45 | no | sí | 1 | 0 |

### Geometría de districts

| ID | Nombre | Celdas | km² | Polígonos | Huecos | Etiqueta .cslmap dentro |
|---:|---|---:|---:|---:|---:|---|
| 127 | Beechwood District | 260 | 0.096 | 1 | 0 | sí |

### Geometría de parks

| ID | Nombre | Celdas | km² | Polígonos | Huecos | Etiqueta .cslmap dentro |
|---:|---|---:|---:|---:|---:|---|

## island-hopping-2026-09-22

Captura: parcial
Dominios no soportados: water, dlcs, mods

| Dominio | Categoría | Conteo raw |
|---|---|---:|
| roads | unresolved | 13123 |
| transit | unresolved | 52 |
| buildings | unresolved | 5492 |
| districts | unresolved | 21 |
| vegetation | unresolved | 220069 |
| parks | unresolved | 13 |
| terrain | unresolved | — |
| water | unresolved | — |

### Rutas de tránsito

| ID | Línea | Paradas | En calle con nombre | Tramos | Sin ruta | Posiciones raw | Posiciones .cslmap | Misma secuencia | .cslmap ⊂ raw | Solapamiento | Segmentos .cslmap inexistentes |
|---:|---|---:|---:|---:|---:|---:|---:|---|---|---:|---:|
| 8 | Metro Line 9 | 4 | 0 | 4 | 0 | 52 | 48 | no | sí | 1 | 0 |
| 11 | Bus Line 11 | 6 | 6 | 6 | 0 | 113 | 107 | no | sí | 1 | 0 |
| 22 | Train Line 8 | 2 | 0 | 2 | 0 | 118 | 116 | no | sí | 1 | 0 |
| 30 | Metro Line 4 | 4 | 0 | 4 | 0 | 66 | 62 | no | sí | 1 | 0 |
| 36 | Ferry Line 2 | 4 | 0 | 4 | 0 | 92 | 88 | no | sí | 1 | 0 |
| 39 | Bus Line 8 | 5 | 5 | 5 | 0 | 46 | 41 | no | sí | 1 | 0 |
| 44 | Bus Line 19 | 7 | 7 | 7 | 0 | 75 | 68 | no | sí | 1 | 0 |
| 45 | Bus Line 13 | 6 | 6 | 6 | 0 | 64 | 58 | no | sí | 1 | 0 |
| 46 | Bus Line 7 | 5 | 5 | 5 | 0 | 47 | 42 | no | sí | 1 | 0 |
| 48 | Metro Line 5 | 4 | 0 | 4 | 0 | 53 | 49 | no | sí | 1 | 0 |
| 50 | Bus Line 3 | 8 | 8 | 8 | 0 | 98 | 90 | no | sí | 1 | 0 |
| 54 | Train Line 7 | 2 | 0 | 2 | 0 | 82 | 80 | no | sí | 1 | 0 |
| 55 | Train Line 14 | 2 | 0 | 2 | 0 | 46 | 44 | no | sí | 1 | 0 |
| 62 | Bus Line 27 | 4 | 4 | 4 | 0 | 63 | 59 | no | sí | 1 | 0 |
| 63 | Bus Line 24 | 3 | 3 | 3 | 0 | 37 | 34 | no | sí | 1 | 0 |
| 67 | Train Line 11 | 2 | 0 | 2 | 0 | 74 | 72 | no | sí | 1 | 0 |
| 70 | Bus Line 16 | 6 | 6 | 6 | 0 | 81 | 75 | no | sí | 1 | 0 |
| 74 | Metro Line 8 | 5 | 0 | 5 | 0 | 67 | 62 | no | sí | 1 | 0 |
| 92 | Train Line 15 | 2 | 0 | 2 | 0 | 58 | 56 | no | sí | 1 | 0 |
| 101 | Bus Line 12 | 6 | 6 | 6 | 0 | 72 | 66 | no | sí | 1 | 0 |
| 108 | Train Line 13 | 4 | 0 | 4 | 0 | 56 | 52 | no | sí | 1 | 0 |
| 111 | Train Line 5 | 2 | 0 | 2 | 0 | 100 | 98 | no | sí | 1 | 0 |
| 112 | Bus Line 9 | 11 | 11 | 11 | 0 | 115 | 104 | no | sí | 1 | 0 |
| 120 | Bus Line 21 | 5 | 5 | 5 | 0 | 88 | 83 | no | sí | 1 | 0 |
| 122 | Train Line 2 | 4 | 0 | 4 | 0 | 56 | 54 | no | sí | 1 | 0 |
| 125 | Bus Line 10 | 8 | 8 | 8 | 0 | 122 | 114 | no | sí | 1 | 0 |
| 128 | Train Line 6 | 2 | 0 | 2 | 0 | 88 | 86 | no | sí | 1 | 0 |
| 131 | Metro Line 6 | 5 | 0 | 5 | 0 | 67 | 62 | no | sí | 1 | 0 |
| 133 | Metro Line 7 | 5 | 0 | 5 | 0 | 67 | 62 | no | sí | 1 | 0 |
| 142 | Bus Line 15 | 9 | 9 | 9 | 0 | 107 | 98 | no | sí | 1 | 0 |
| 143 | Train Line 1 | 2 | 0 | 2 | 0 | 52 | 50 | no | sí | 1 | 0 |
| 154 | Train Line 4 | 2 | 0 | 2 | 0 | 102 | 100 | no | sí | 1 | 0 |
| 156 | Bus Line 17 | 6 | 6 | 6 | 0 | 86 | 80 | no | sí | 1 | 0 |
| 167 | Bus Line 4 | 8 | 8 | 8 | 0 | 98 | 90 | no | sí | 1 | 0 |
| 168 | Train Line 10 | 2 | 0 | 2 | 0 | 62 | 60 | no | sí | 1 | 0 |
| 171 | Bus Line 14 | 9 | 9 | 9 | 0 | 109 | 100 | no | sí | 1 | 0 |
| 176 | Bus Line 25 | 2 | 2 | 2 | 0 | 139 | 137 | no | sí | 1 | 0 |
| 183 | Bus Line 23 | 11 | 11 | 11 | 0 | 139 | 128 | no | sí | 1 | 0 |
| 188 | Ferry Line 1 | 6 | 0 | 6 | 0 | 86 | 80 | no | sí | 1 | 0 |
| 195 | Bus Line 6 | 16 | 16 | 16 | 0 | 158 | 142 | no | sí | 1 | 0 |
| 203 | Metro Line 1 | 5 | 0 | 5 | 0 | 64 | 59 | no | sí | 1 | 0 |
| 208 | Bus Line 20 | 8 | 8 | 8 | 0 | 84 | 76 | no | sí | 1 | 0 |
| 212 | Bus Line 1 | 7 | 7 | 7 | 0 | 75 | 68 | no | sí | 1 | 0 |
| 215 | Bus Line 2 | 7 | 6 | 7 | 0 | 72 | 65 | no | sí | 1 | 0 |
| 221 | Train Line 9 | 2 | 0 | 2 | 0 | 120 | 118 | no | sí | 1 | 0 |
| 224 | Bus Line 18 | 7 | 7 | 7 | 0 | 77 | 70 | no | sí | 1 | 0 |
| 234 | Metro Line 2 | 6 | 0 | 6 | 0 | 64 | 58 | no | sí | 1 | 0 |
| 235 | Bus Line 22 | 11 | 11 | 11 | 0 | 137 | 126 | no | sí | 1 | 0 |
| 241 | Bus Line 26 | 6 | 6 | 6 | 0 | 53 | 47 | no | sí | 1 | 0 |
| 244 | Metro Line 3 | 2 | 0 | 2 | 0 | 20 | 18 | no | sí | 1 | 0 |
| 248 | Bus Line 0 | 0 | 0 | 0 | 0 | 0 | 0 | sí | sí | 1 | 0 |
| 254 | Bus Line 5 | 14 | 14 | 14 | 0 | 158 | 144 | no | sí | 1 | 0 |

### Geometría de districts

| ID | Nombre | Celdas | km² | Polígonos | Huecos | Etiqueta .cslmap dentro |
|---:|---|---:|---:|---:|---:|---|
| 107 | Crest District | 178 | 0.066 | 1 | 0 | sí |
| 108 | Cedar Hills | 485 | 0.179 | 1 | 0 | sí |
| 109 | Anchor Heights | 2302 | 0.849 | 1 | 0 | sí |
| 110 | Beechwood Hills | 1701 | 0.627 | 1 | 0 | sí |
| 111 | Lake Park | 1031 | 0.38 | 1 | 0 | sí |
| 112 | High Park | 3013 | 1.111 | 1 | 0 | sí |
| 113 | Olive Heights | 2945 | 1.086 | 1 | 0 | sí |
| 114 | Magnolia Park | 4922 | 1.814 | 1 | 0 | sí |
| 115 | Foggy District | 1677 | 0.618 | 1 | 0 | sí |
| 116 | Green District | 350 | 0.129 | 1 | 0 | sí |
| 117 | Hemlock Heights | 4118 | 1.518 | 1 | 0 | sí |
| 118 | Valley District | 1553 | 0.572 | 1 | 0 | sí |
| 119 | Thornton Heights | 4021 | 1.482 | 1 | 0 | sí |
| 120 | Anchor Heights | 1252 | 0.462 | 1 | 0 | sí |
| 121 | Elk District | 856 | 0.316 | 1 | 0 | sí |
| 122 | Sycamore Square | 5380 | 1.983 | 1 | 0 | sí |
| 123 | Beech Park | 3258 | 1.201 | 1 | 0 | sí |
| 124 | Hillside Square | 1884 | 0.695 | 2 | 0 | sí |
| 125 | Washington District | 1391 | 0.513 | 1 | 0 | sí |
| 126 | Umber Heights | 2480 | 0.914 | 1 | 0 | sí |
| 127 | Park Square | 2112 | 0.779 | 1 | 0 | sí |

### Geometría de parks

| ID | Nombre | Celdas | km² | Polígonos | Huecos | Etiqueta .cslmap dentro |
|---:|---|---:|---:|---:|---:|---|
| 114 | Spruce Garden | 242 | 0.089 | 1 | 0 | sí |
| 115 | Forrest Polytechnic Institute | 981 | 0.362 | 1 | 0 | sí |
| 117 | Concord Grounds | 131 | 0.048 | 1 | 0 | sí |
| 118 | Dale National Park | 405 | 0.149 | 1 | 0 | sí |
| 119 | Myrtle Meadows | 168 | 0.062 | 1 | 0 | sí |
| 120 | Heather Meadows | 120 | 0.044 | 1 | 0 | sí |
| 121 | Spring Park | 124 | 0.046 | 1 | 0 | sí |
| 122 | Autumn Hill | 76 | 0.028 | 1 | 0 | sí |
| 123 | Manor City Park | 102 | 0.038 | 1 | 0 | sí |
| 124 | Grove Garden | 136 | 0.05 | 1 | 0 | sí |
| 125 | Aspen Meadows | 234 | 0.086 | 1 | 0 | sí |
| 126 | Ivy Park | 369 | 0.136 | 1 | 0 | sí |
| 127 | Linden Woods | 1601 | 0.59 | 1 | 1 | sí |

## pepper-lake-2026-09-22

Captura: parcial
Dominios no soportados: water, dlcs, mods

| Dominio | Categoría | Conteo raw |
|---|---|---:|
| roads | unresolved | 10883 |
| transit | unresolved | 28 |
| buildings | unresolved | 19269 |
| districts | unresolved | 44 |
| vegetation | unresolved | 177177 |
| parks | unresolved | 0 |
| terrain | unresolved | — |
| water | unresolved | — |

### Rutas de tránsito

| ID | Línea | Paradas | En calle con nombre | Tramos | Sin ruta | Posiciones raw | Posiciones .cslmap | Misma secuencia | .cslmap ⊂ raw | Solapamiento | Segmentos .cslmap inexistentes |
|---:|---|---:|---:|---:|---:|---:|---:|---|---|---:|---:|
| 7 | Bus Line 4 | 20 | 20 | 20 | 0 | 118 | 98 | no | sí | 1 | 0 |
| 19 | Train Line 3 | 8 | 0 | 8 | 0 | 231 | 223 | no | sí | 1 | 0 |
| 33 | Bus Line 11 | 17 | 17 | 17 | 0 | 157 | 140 | no | sí | 1 | 0 |
| 35 | Bus Line 3 | 17 | 17 | 17 | 0 | 92 | 75 | no | sí | 1 | 0 |
| 50 | Bus Line 13 | 18 | 18 | 18 | 0 | 119 | 101 | no | sí | 1 | 0 |
| 60 | Metro Line 4 | 6 | 0 | 6 | 0 | 64 | 58 | no | sí | 1 | 0 |
| 69 | Bus Line 7 | 16 | 16 | 16 | 0 | 93 | 77 | no | sí | 1 | 0 |
| 83 | Bus Line 12 | 12 | 12 | 12 | 0 | 70 | 58 | no | sí | 1 | 0 |
| 98 | Bus Line 6 | 25 | 25 | 25 | 0 | 168 | 143 | no | sí | 1 | 0 |
| 101 | Tram Line 2 | 15 | 12 | 15 | 0 | 103 | 88 | no | sí | 1 | 0 |
| 106 | Bus Line 14 | 28 | 28 | 28 | 0 | 196 | 168 | no | sí | 1 | 0 |
| 107 | Bus Line 8 | 22 | 22 | 22 | 0 | 183 | 161 | no | sí | 1 | 0 |
| 119 | Tram Line 3 | 12 | 12 | 12 | 0 | 122 | 110 | no | sí | 1 | 0 |
| 126 | Bus Line 2 | 12 | 12 | 12 | 0 | 66 | 54 | no | sí | 1 | 0 |
| 132 | Tram Line 1 | 26 | 26 | 26 | 0 | 267 | 241 | no | sí | 1 | 0 |
| 135 | Bus Line 16 | 28 | 28 | 28 | 0 | 187 | 159 | no | sí | 1 | 0 |
| 143 | Bus Line 10 | 30 | 30 | 30 | 0 | 210 | 180 | no | sí | 1 | 0 |
| 155 | TRANSPORT_LINE_PATTERN[Evacuation Bus]:0 | 9 | 8 | 9 | 0 | 84 | 75 | no | sí | 1 | 0 |
| 169 | Bus Line 1 | 21 | 21 | 21 | 0 | 117 | 96 | no | sí | 1 | 0 |
| 184 | Metro Line 2 | 30 | 0 | 30 | 0 | 372 | 342 | no | sí | 1 | 0 |
| 199 | Metro Line 5 | 8 | 0 | 8 | 0 | 100 | 92 | no | sí | 1 | 0 |
| 220 | Bus Line 0 | 0 | 0 | 0 | 0 | 0 | 0 | sí | sí | 1 | 0 |
| 227 | Metro Line 1 | 20 | 0 | 20 | 0 | 248 | 228 | no | sí | 1 | 0 |
| 228 | Bus Line 9 | 15 | 15 | 15 | 0 | 105 | 90 | no | sí | 1 | 0 |
| 232 | Metro Line 6 | 11 | 0 | 11 | 0 | 150 | 139 | no | sí | 1 | 0 |
| 235 | Bus Line 5 | 16 | 16 | 16 | 0 | 88 | 72 | no | sí | 1 | 0 |
| 236 | Metro Line 3 | 8 | 0 | 8 | 0 | 98 | 90 | no | sí | 1 | 0 |
| 248 | Bus Line 15 | 10 | 10 | 10 | 0 | 53 | 43 | no | sí | 1 | 0 |

### Geometría de districts

| ID | Nombre | Celdas | km² | Polígonos | Huecos | Etiqueta .cslmap dentro |
|---:|---|---:|---:|---:|---:|---|
| 84 | Magnolia Heights | 574 | 0.212 | 1 | 0 | sí |
| 85 | Applegate District | 713 | 0.263 | 1 | 0 | sí |
| 86 | Smith Square | 241 | 0.089 | 1 | 0 | sí |
| 87 | Magnolia District | 875 | 0.323 | 1 | 0 | sí |
| 88 | Applegate Hills | 703 | 0.259 | 1 | 0 | sí |
| 89 | Pleasant Park | 631 | 0.233 | 1 | 0 | sí |
| 90 | Sheffield Square | 522 | 0.192 | 1 | 0 | sí |
| 91 | Middle Square | 687 | 0.253 | 1 | 0 | sí |
| 92 | Mill Heights | 1940 | 0.715 | 1 | 0 | sí |
| 93 | Magnolia Heights | 1361 | 0.502 | 1 | 0 | sí |
| 94 | Cherry Heights | 1466 | 0.54 | 3 | 0 | sí |
| 95 | Pleasant Heights | 939 | 0.346 | 1 | 0 | sí |
| 96 | Daffodil Square | 1789 | 0.659 | 1 | 0 | sí |
| 97 | Coleridge Square | 1112 | 0.41 | 1 | 0 | sí |
| 98 | Crescent Heights | 1055 | 0.389 | 1 | 0 | sí |
| 99 | Barlow Heights | 1109 | 0.409 | 1 | 0 | sí |
| 100 | Garnet Hills | 1098 | 0.405 | 1 | 0 | sí |
| 101 | Sunset Square | 1611 | 0.594 | 1 | 0 | sí |
| 102 | Oriental Square | 1666 | 0.614 | 1 | 0 | sí |
| 103 | King Heights | 2001 | 0.738 | 1 | 0 | sí |
| 104 | Belmont Heights | 1321 | 0.487 | 1 | 0 | sí |
| 105 | Lake District | 1696 | 0.625 | 1 | 0 | sí |
| 106 | Smith District | 5426 | 2 | 1 | 0 | sí |
| 107 | Sheffield Square | 2673 | 0.985 | 1 | 0 | sí |
| 108 | Dale Park | 933 | 0.344 | 1 | 0 | sí |
| 109 | Madison Heights | 2021 | 0.745 | 1 | 0 | sí |
| 110 | Manor Heights | 2039 | 0.752 | 1 | 0 | sí |
| 111 | Strawberry District | 722 | 0.266 | 1 | 0 | sí |
| 112 | Poplar Square | 1458 | 0.537 | 1 | 0 | sí |
| 113 | Birdsong District | 767 | 0.283 | 1 | 0 | sí |
| 114 | Oriental Heights | 1552 | 0.572 | 1 | 0 | sí |
| 115 | Amity Hills | 1000 | 0.369 | 1 | 0 | sí |
| 116 | Lake Square | 3451 | 1.272 | 1 | 0 | sí |
| 117 | Oak District | 1211 | 0.446 | 1 | 0 | sí |
| 118 | Spring Square | 2094 | 0.772 | 1 | 0 | sí |
| 119 | Middle Square | 1828 | 0.674 | 1 | 0 | sí |
| 120 | Beech Heights | 2312 | 0.852 | 1 | 0 | sí |
| 121 | Foggy Hills | 950 | 0.35 | 1 | 0 | sí |
| 122 | Butler Hills | 4591 | 1.692 | 1 | 0 | sí |
| 123 | Sheffield Park | 1128 | 0.416 | 1 | 0 | sí |
| 124 | Briar Rose Park | 2049 | 0.755 | 1 | 0 | sí |
| 125 | Holly Park | 3983 | 1.468 | 1 | 0 | sí |
| 126 | Hickory District | 2499 | 0.921 | 1 | 0 | sí |
| 127 | Oriental Hills | 301 | 0.111 | 1 | 0 | sí |

### Geometría de parks

| ID | Nombre | Celdas | km² | Polígonos | Huecos | Etiqueta .cslmap dentro |
|---:|---|---:|---:|---:|---:|---|

## verkehrsbehebung-2026-09-22

Captura: parcial
Dominios no soportados: water, dlcs, mods

| Dominio | Categoría | Conteo raw |
|---|---|---:|
| roads | unresolved | 2735 |
| transit | unresolved | 0 |
| buildings | unresolved | 3317 |
| districts | unresolved | 1 |
| vegetation | unresolved | 50458 |
| parks | unresolved | 0 |
| terrain | unresolved | — |
| water | unresolved | — |

### Rutas de tránsito

| ID | Línea | Paradas | En calle con nombre | Tramos | Sin ruta | Posiciones raw | Posiciones .cslmap | Misma secuencia | .cslmap ⊂ raw | Solapamiento | Segmentos .cslmap inexistentes |
|---:|---|---:|---:|---:|---:|---:|---:|---|---|---:|---:|

### Geometría de districts

| ID | Nombre | Celdas | km² | Polígonos | Huecos | Etiqueta .cslmap dentro |
|---:|---|---:|---:|---:|---:|---|
| 127 | Washington District | 302 | 0.111 | 1 | 0 | sí |

### Geometría de parks

| ID | Nombre | Celdas | km² | Polígonos | Huecos | Etiqueta .cslmap dentro |
|---:|---|---:|---:|---:|---:|---|

## costa-tijuca-2026-09-22

Captura: parcial
Dominios no soportados: water, dlcs, mods

| Dominio | Categoría | Conteo raw |
|---|---|---:|
| roads | unresolved | 17609 |
| transit | unresolved | 24 |
| buildings | unresolved | 23262 |
| districts | unresolved | 31 |
| vegetation | unresolved | 115259 |
| parks | unresolved | 17 |
| terrain | unresolved | — |
| water | unresolved | — |

### Rutas de tránsito

| ID | Línea | Paradas | En calle con nombre | Tramos | Sin ruta | Posiciones raw | Posiciones .cslmap | Misma secuencia | .cslmap ⊂ raw | Solapamiento | Segmentos .cslmap inexistentes |
|---:|---|---:|---:|---:|---:|---:|---:|---|---|---:|---:|
| 3 | Bus Line 6 | 15 | 15 | 15 | 0 | 237 | 222 | no | sí | 1 | 0 |
| 5 | Train Line 1 | 8 | 0 | 8 | 0 | 364 | 356 | no | sí | 1 | 0 |
| 18 | Bus Line 15 | 3 | 3 | 3 | 0 | 212 | 209 | no | sí | 1 | 0 |
| 37 | Bus Line 10 | 29 | 29 | 29 | 0 | 244 | 215 | no | sí | 1 | 0 |
| 46 | Bus Line 12 | 4 | 3 | 4 | 0 | 353 | 349 | no | sí | 1 | 0 |
| 58 | Monorail Line 1 | 14 | 12 | 14 | 0 | 230 | 216 | no | sí | 1 | 0 |
| 62 | Bus Line 8 | 33 | 33 | 33 | 0 | 450 | 417 | no | sí | 1 | 0 |
| 93 | Bus Line 3 | 19 | 19 | 19 | 0 | 205 | 186 | no | sí | 1 | 0 |
| 98 | Bus Line 2 | 12 | 12 | 12 | 0 | 238 | 226 | no | sí | 1 | 0 |
| 111 | Bus Line 4 | 23 | 23 | 23 | 0 | 342 | 319 | no | sí | 1 | 0 |
| 124 | Bus Line 16 | 28 | 26 | 28 | 0 | 695 | 667 | no | sí | 1 | 0 |
| 145 | Metro Line 1 | 23 | 0 | 23 | 0 | 409 | 387 | no | sí | 1 | 0 |
| 158 | Bus Line 1 | 21 | 21 | 21 | 0 | 292 | 271 | no | sí | 1 | 0 |
| 168 | Metro Line 0 | 0 | 0 | 0 | 0 | 0 | 0 | sí | sí | 1 | 0 |
| 173 | Tram Line 1 | 32 | 32 | 32 | 0 | 351 | 319 | no | sí | 1 | 0 |
| 179 | Bus Line 13 | 5 | 4 | 5 | 0 | 354 | 349 | no | sí | 1 | 0 |
| 184 | Tram Line 2 | 12 | 12 | 12 | 0 | 129 | 117 | no | sí | 1 | 0 |
| 194 | Bus Line 7 | 5 | 5 | 5 | 0 | 127 | 122 | no | sí | 1 | 0 |
| 218 | Metro Line 2 | 14 | 0 | 14 | 0 | 226 | 212 | no | sí | 1 | 0 |
| 233 | Bus Line 14 | 2 | 1 | 2 | 0 | 185 | 183 | no | sí | 1 | 0 |
| 235 | Bus Line 9 | 14 | 14 | 14 | 0 | 132 | 118 | no | sí | 1 | 0 |
| 239 | Bus Line 17 | 18 | 18 | 18 | 0 | 304 | 286 | no | sí | 1 | 0 |
| 253 | Bus Line 11 | 4 | 3 | 4 | 0 | 274 | 270 | no | sí | 1 | 0 |
| 254 | Bus Line 5 | 23 | 23 | 23 | 0 | 187 | 164 | no | sí | 1 | 0 |

### Geometría de districts

| ID | Nombre | Celdas | km² | Polígonos | Huecos | Etiqueta .cslmap dentro |
|---:|---|---:|---:|---:|---:|---|
| 97 | Hillside Park | 5448 | 2.008 | 1 | 0 | sí |
| 98 | Birdsong Heights | 4971 | 1.833 | 1 | 0 | sí |
| 99 | Park Heights | 5238 | 1.931 | 1 | 0 | sí |
| 100 | Valley Heights | 15247 | 5.621 | 1 | 0 | sí |
| 101 | Hamilton District | 1776 | 0.655 | 1 | 0 | sí |
| 102 | Sterling Hills | 7080 | 2.61 | 1 | 0 | sí |
| 103 | Oak Heights | 13971 | 5.15 | 1 | 0 | sí |
| 104 | Elizabeth Heights | 28671 | 10.569 | 1 | 0 | sí |
| 105 | Fawn Park | 2247 | 0.828 | 1 | 0 | sí |
| 106 | Valley District | 2777 | 1.024 | 1 | 0 | sí |
| 107 | Oak District | 6681 | 2.463 | 1 | 0 | sí |
| 108 | Underhill District | 663 | 0.244 | 1 | 0 | sí |
| 109 | Chestnut Park | 535 | 0.197 | 1 | 0 | sí |
| 110 | Crescent Hills | 21603 | 7.964 | 1 | 0 | sí |
| 111 | Applegate Square | 3204 | 1.181 | 1 | 0 | sí |
| 112 | Beechwood Heights | 2300 | 0.848 | 1 | 0 | sí |
| 113 | Walnut Heights | 1701 | 0.627 | 1 | 0 | sí |
| 114 | Washington Heights | 1261 | 0.465 | 1 | 0 | sí |
| 115 | Sterling District | 1206 | 0.445 | 1 | 0 | sí |
| 116 | Hamilton District | 2804 | 1.034 | 1 | 0 | sí |
| 117 | Washington Square | 1512 | 0.557 | 1 | 0 | sí |
| 118 | Crest District | 2777 | 1.024 | 1 | 0 | sí |
| 119 | Strawberry Park | 1766 | 0.651 | 1 | 0 | sí |
| 120 | Chestnut Square | 3929 | 1.448 | 1 | 0 | sí |
| 121 | Underhill Hills | 1249 | 0.46 | 1 | 0 | sí |
| 122 | Oriental District | 3963 | 1.461 | 1 | 0 | sí |
| 123 | Praça Industrial | 2150 | 0.793 | 1 | 0 | sí |
| 124 | Sunset Park | 3306 | 1.219 | 1 | 0 | sí |
| 125 | Magnolia Park | 2621 | 0.966 | 1 | 0 | sí |
| 126 | Chestnut Hills | 3990 | 1.471 | 1 | 0 | sí |
| 127 | Sheffield District | 2608 | 0.961 | 1 | 0 | sí |

### Geometría de parks

| ID | Nombre | Celdas | km² | Polígonos | Huecos | Etiqueta .cslmap dentro |
|---:|---|---:|---:|---:|---:|---|
| 111 | Myrtle Meadows | 12191 | 4.494 | 1 | 0 | sí |
| 112 | Evergreen World | 385 | 0.142 | 1 | 0 | sí |
| 113 | Beechwood College of Liberal Arts | 4090 | 1.508 | 1 | 0 | sí |
| 114 | Evergreen Animal World | 848 | 0.313 | 1 | 0 | sí |
| 115 | Valley Oil Well | 2712 | 1 | 1 | 0 | sí |
| 116 | Laurel City Airport | 6312 | 2.327 | 2 | 0 | sí |
| 117 | Technological Institute of Costa Tijuca | 2116 | 0.78 | 1 | 0 | sí |
| 118 | Strawberry Pit | 28715 | 10.585 | 1 | 0 | sí |
| 119 | Lafayette Hill | 367 | 0.135 | 1 | 0 | sí |
| 120 | Butler Logging Area Site | 8451 | 3.115 | 1 | 0 | sí |
| 121 | Tijuca Football Club | 1000 | 0.369 | 1 | 0 | sí |
| 122 | Parque Línear Itape | 1388 | 0.512 | 1 | 0 | sí |
| 123 | Beech Fields | 9792 | 3.61 | 1 | 0 | sí |
| 124 | Pearl Polytechnic Institute | 4380 | 1.615 | 1 | 0 | sí |
| 125 | Garnet Meadows | 1323 | 0.488 | 1 | 0 | sí |
| 126 | Empire Street | 1253 | 0.462 | 1 | 0 | sí |
| 127 | Brook Garden | 880 | 0.324 | 1 | 1 | sí |

## san-rico-2026-09-22

Captura: parcial
Dominios no soportados: water, dlcs, mods

| Dominio | Categoría | Conteo raw |
|---|---|---:|
| roads | unresolved | 31430 |
| transit | unresolved | 113 |
| buildings | unresolved | 46888 |
| districts | unresolved | 90 |
| vegetation | unresolved | 262143 |
| parks | unresolved | 0 |
| terrain | unresolved | — |
| water | unresolved | — |

### Rutas de tránsito

| ID | Línea | Paradas | En calle con nombre | Tramos | Sin ruta | Posiciones raw | Posiciones .cslmap | Misma secuencia | .cslmap ⊂ raw | Solapamiento | Segmentos .cslmap inexistentes |
|---:|---|---:|---:|---:|---:|---:|---:|---|---|---:|---:|
| 1 | Alexandria - Downtown #30 | 21 | 20 | 21 | 0 | 244 | 223 | no | sí | 1 | 0 |
| 2 | New Corfu - Greenwood #16 | 2 | 0 | 2 | 0 | 28 | 26 | no | sí | 1 | 0 |
| 10 | Vanderbilt Park Express #49 | 2 | 1 | 2 | 0 | 137 | 135 | no | sí | 1 | 0 |
| 11 | West Side Loop #41 | 18 | 0 | 18 | 0 | 214 | 196 | no | sí | 1 | 0 |
| 12 | San Marco Beach - Greenwood #8 | 4 | 0 | 4 | 0 | 158 | 154 | no | sí | 1 | 0 |
| 17 | Spartacus Line 9 | 54 | 54 | 54 | 0 | 226 | 172 | no | sí | 1 | 0 |
| 20 | South Ridge Line #46 | 14 | 13 | 14 | 0 | 312 | 298 | no | sí | 1 | 0 |
| 21 | Hamilton St Metro Line 1 | 8 | 0 | 8 | 0 | 46 | 38 | no | sí | 1 | 0 |
| 22 | Florence Heights Line 8 | 28 | 28 | 28 | 0 | 124 | 96 | no | sí | 1 | 0 |
| 23 | Ferry Line 0 | 0 | 0 | 0 | 0 | 0 | 0 | sí | sí | 1 | 0 |
| 25 | Pershing Square #29 | 30 | 29 | 30 | 0 | 163 | 133 | no | sí | 1 | 0 |
| 27 | Old Downtown Metro Line 4 | 22 | 0 | 22 | 0 | 282 | 260 | no | sí | 1 | 0 |
| 28 | Hospital Express Metro Line 2 | 7 | 0 | 7 | 0 | 42 | 36 | no | sí | 1 | 0 |
| 31 | South Holland - Downtown Exp #22 | 4 | 2 | 4 | 0 | 152 | 148 | no | sí | 1 | 0 |
| 32 | Rock Island Express #22 | 17 | 0 | 17 | 0 | 124 | 107 | no | sí | 1 | 0 |
| 35 | Westminster - Downtown Line #32 | 2 | 0 | 2 | 0 | 100 | 98 | no | sí | 1 | 0 |
| 41 | Hyde Park 57th St. - Porter #7 | 4 | 0 | 4 | 0 | 172 | 168 | no | sí | 1 | 0 |
| 44 | West End South Loop Line #31 | 8 | 0 | 8 | 0 | 68 | 60 | no | sí | 1 | 0 |
| 45 | South San Rico West Side SN #44 | 9 | 0 | 9 | 0 | 62 | 53 | no | sí | 1 | 0 |
| 46 | Santa Maria Beach Loop #37 | 43 | 42 | 43 | 0 | 373 | 330 | no | sí | 1 | 0 |
| 50 | Westminster - Downtown #34 | 39 | 38 | 39 | 0 | 315 | 276 | no | sí | 1 | 0 |
| 54 | San Marco beach - Dwntwn Loop #5 | 10 | 5 | 10 | 0 | 254 | 244 | no | sí | 1 | 0 |
| 56 | Beach-Corfu Island Ferry #1 | 2 | 0 | 2 | 0 | 30 | 28 | no | sí | 1 | 0 |
| 62 | Rock Island - Lincoln Park #26 | 2 | 0 | 2 | 0 | 88 | 86 | no | sí | 1 | 0 |
| 63 | Ogden Dunes - Downtown Exp #28 | 5 | 3 | 5 | 0 | 301 | 296 | no | sí | 1 | 0 |
| 65 | New Corfu Loop #26 | 24 | 23 | 24 | 0 | 126 | 102 | no | sí | 1 | 0 |
| 66 | Bob Newbie Airport Express #10 | 2 | 0 | 2 | 0 | 134 | 132 | no | sí | 1 | 0 |
| 67 | New Ionia Downtown Loop Line #2 | 5 | 0 | 5 | 0 | 76 | 71 | no | sí | 1 | 0 |
| 69 | Meadows Heights Bus Line 6 | 33 | 33 | 33 | 0 | 177 | 144 | no | sí | 1 | 0 |
| 72 | LaSalle Loop #48 | 19 | 19 | 19 | 0 | 114 | 95 | no | sí | 1 | 0 |
| 74 | Hamilton St Metro Line 3 | 8 | 0 | 8 | 0 | 46 | 38 | no | sí | 1 | 0 |
| 75 | Rosemary Richardson Loop #37 | 3 | 0 | 3 | 0 | 33 | 30 | no | sí | 1 | 0 |
| 76 | Harlem-Dwntwn Apt Exp #11 | 7 | 7 | 7 | 0 | 140 | 133 | no | sí | 1 | 0 |
| 77 | Ogden Dunes - San Rico Beach #2 | 2 | 0 | 2 | 0 | 46 | 44 | no | sí | 1 | 0 |
| 78 | Bob Newbie Apt Express #21 | 8 | 6 | 8 | 0 | 465 | 457 | no | sí | 1 | 0 |
| 80 | Hickory Hills - Downtown #18 | 23 | 22 | 23 | 0 | 255 | 232 | no | sí | 1 | 0 |
| 81 | Ellis Island - Downtown Ferry #2 | 2 | 0 | 2 | 0 | 96 | 94 | no | sí | 1 | 0 |
| 83 | South Side Suburbs #43 | 38 | 37 | 38 | 0 | 360 | 322 | no | sí | 1 | 0 |
| 84 | South San Rico West Side SN #43 | 9 | 0 | 9 | 0 | 62 | 53 | no | sí | 1 | 0 |
| 88 | San Rico Beach - Corfu Island #1 | 4 | 0 | 4 | 0 | 92 | 88 | no | sí | 1 | 0 |
| 89 | South San Rico East Loop #40 | 73 | 72 | 73 | 0 | 383 | 310 | no | sí | 1 | 0 |
| 96 | New Ionia Island Express Line #3 | 8 | 0 | 8 | 0 | 398 | 390 | no | sí | 1 | 0 |
| 97 | Ogden Dunes - San Rico Beach #12 | 7 | 6 | 7 | 0 | 93 | 86 | no | sí | 1 | 0 |
| 98 | Huntington Beach Loop #38 | 68 | 67 | 68 | 0 | 476 | 408 | no | sí | 1 | 0 |
| 99 | Airport Island - Dwntwn Exp #35 | 15 | 14 | 15 | 0 | 176 | 161 | no | sí | 1 | 0 |
| 100 | Lafayette Square Park Loop #19 | 20 | 0 | 20 | 0 | 166 | 146 | no | sí | 1 | 0 |
| 101 | Bob Newbie Beach Express #13 | 2 | 0 | 2 | 0 | 118 | 116 | no | sí | 1 | 0 |
| 104 | Airport Suburbs #45 | 38 | 36 | 38 | 0 | 414 | 376 | no | sí | 1 | 0 |
| 113 | Rhodes - Corfu Island Line #3 | 6 | 3 | 6 | 0 | 100 | 94 | no | sí | 1 | 0 |
| 119 | Alcatraz island Ferry #4 | 2 | 0 | 2 | 0 | 70 | 68 | no | sí | 1 | 0 |
| 123 | Downtown Island Express Line #4 | 10 | 0 | 10 | 0 | 408 | 398 | no | sí | 1 | 0 |
| 124 | Gatwick Downtown Express #27 | 2 | 0 | 2 | 0 | 140 | 138 | no | sí | 1 | 0 |
| 125 | Gatwick North Loop L Line #28 | 24 | 0 | 24 | 0 | 152 | 128 | no | sí | 1 | 0 |
| 130 | Gatwick Bob Newbie Exp #14 | 2 | 0 | 2 | 0 | 50 | 48 | no | sí | 1 | 0 |
| 131 | Ogden Dunes - Rhodes Line #16 | 5 | 4 | 5 | 0 | 305 | 300 | no | sí | 1 | 0 |
| 132 | Glenn Park - Downtown Bus Line 2 | 17 | 17 | 17 | 0 | 205 | 188 | no | sí | 1 | 0 |
| 133 | Florence Heights Loop Line #9 | 13 | 0 | 13 | 0 | 82 | 69 | no | sí | 1 | 0 |
| 136 | Westminster - Commerce Plaza #39 | 2 | 0 | 2 | 0 | 54 | 52 | no | sí | 1 | 0 |
| 139 | Santa Maria Island Loop #39 | 10 | 9 | 10 | 0 | 188 | 178 | no | sí | 1 | 0 |
| 140 | Greenwood - Carnegie Heights #14 | 48 | 47 | 48 | 0 | 196 | 148 | no | sí | 1 | 0 |
| 142 | Corinthia - Lincoln Park #24 | 2 | 0 | 2 | 0 | 70 | 68 | no | sí | 1 | 0 |
| 143 | Wheatfield/Porter #47 | 3 | 3 | 3 | 0 | 211 | 208 | no | sí | 1 | 0 |
| 149 | Nazareth Heights - Downtown #40 | 2 | 0 | 2 | 0 | 30 | 28 | no | sí | 1 | 0 |
| 153 | San Rico Beach Island Express #6 | 6 | 0 | 6 | 0 | 340 | 334 | no | sí | 1 | 0 |
| 154 | Airport Island - Downtown #4 | 4 | 1 | 4 | 0 | 62 | 58 | no | sí | 1 | 0 |
| 156 | South San Rico Downtown Exp #45 | 2 | 0 | 2 | 0 | 56 | 54 | no | sí | 1 | 0 |
| 157 | Greenwich - Downtown #19 | 30 | 29 | 30 | 0 | 300 | 270 | no | sí | 1 | 0 |
| 158 | Meadows heights - Downtown #7 | 26 | 26 | 26 | 0 | 187 | 161 | no | sí | 1 | 0 |
| 160 | Anthem Heights Dwntn #20 | 37 | 36 | 37 | 0 | 297 | 260 | no | sí | 1 | 0 |
| 161 | Riverdale - Downtown #32 | 21 | 20 | 21 | 0 | 165 | 144 | no | sí | 1 | 0 |
| 163 | South Holland - East Side Ex #34 | 2 | 0 | 2 | 0 | 72 | 70 | no | sí | 1 | 0 |
| 164 | Hegewisch - Downtown #33 | 19 | 18 | 19 | 0 | 154 | 135 | no | sí | 1 | 0 |
| 165 | San Rico Suburbs Loop Line #1 | 11 | 0 | 11 | 0 | 431 | 420 | no | sí | 1 | 0 |
| 168 | Inglewood Bus Line 5 | 14 | 14 | 14 | 0 | 155 | 141 | no | sí | 1 | 0 |
| 169 | Westminster North Loop Line #30 | 14 | 0 | 14 | 0 | 108 | 94 | no | sí | 1 | 0 |
| 170 | Commerce Plaza Loop #42 | 8 | 0 | 8 | 0 | 102 | 94 | no | sí | 1 | 0 |
| 174 | Corinthia - Downtown #23 | 83 | 82 | 83 | 0 | 532 | 449 | no | sí | 1 | 0 |
| 178 | Corinthia - East End #25 | 2 | 0 | 2 | 0 | 12 | 10 | no | sí | 1 | 0 |
| 179 | Big San Rico Island Bus Line 1 | 47 | 47 | 47 | 0 | 166 | 119 | no | sí | 1 | 0 |
| 180 | South Side Loop #42 | 77 | 76 | 77 | 0 | 392 | 315 | no | sí | 1 | 0 |
| 182 | Lincoln Park - Dwn Exp Line 7 | 2 | 0 | 2 | 0 | 42 | 40 | no | sí | 1 | 0 |
| 184 | New Downtown Loop #25 | 21 | 20 | 21 | 0 | 146 | 125 | no | sí | 1 | 0 |
| 185 | Greenwood Downtwon Loop #20 | 6 | 0 | 6 | 0 | 44 | 38 | no | sí | 1 | 0 |
| 190 | Bob Newbie Island Express #15 | 2 | 0 | 2 | 0 | 78 | 76 | no | sí | 1 | 0 |
| 192 | Corinthia Loop #23 | 20 | 0 | 20 | 0 | 128 | 108 | no | sí | 1 | 0 |
| 193 | South West Suburbs #44 | 19 | 18 | 19 | 0 | 176 | 157 | no | sí | 1 | 0 |
| 194 | Old Downtown Metro Line 5 | 22 | 0 | 22 | 0 | 282 | 260 | no | sí | 1 | 0 |
| 196 | San Rico Beach Commuter Loop #12 | 10 | 0 | 10 | 0 | 200 | 190 | no | sí | 1 | 0 |
| 198 | Harvey - Downtown Express Line 4 | 18 | 18 | 18 | 0 | 223 | 205 | no | sí | 1 | 0 |
| 202 | San Marco Beach Loop Line #41 | 83 | 82 | 83 | 0 | 515 | 433 | no | sí | 1 | 0 |
| 204 | New Corfu - Downtown #17 | 12 | 0 | 12 | 0 | 108 | 96 | no | sí | 1 | 0 |
| 208 | Museum Express #15 | 18 | 17 | 18 | 0 | 102 | 84 | no | sí | 1 | 0 |
| 209 | Rhodes - Elysia Island Ferry #3 | 2 | 0 | 2 | 0 | 22 | 20 | no | sí | 1 | 0 |
| 213 | New Ionia - Old Dwntn Scenic #46 | 2 | 0 | 2 | 0 | 76 | 74 | no | sí | 1 | 0 |
| 214 | West - North Dwntwn Loop #18 | 19 | 0 | 19 | 0 | 169 | 150 | no | sí | 1 | 0 |
| 217 | East Side SW Loop #38 | 17 | 0 | 17 | 0 | 183 | 166 | no | sí | 1 | 0 |
| 219 | Lincoln Park Metro Line 6 | 4 | 0 | 4 | 0 | 67 | 63 | no | sí | 1 | 0 |
| 220 | Hyde Park - Downtown Line 3 | 25 | 25 | 25 | 0 | 251 | 226 | no | sí | 1 | 0 |
| 227 | San Rico Suburbs Loop Line #5 | 7 | 0 | 7 | 0 | 378 | 371 | no | sí | 1 | 0 |
| 229 | Gatwick-Greenwich Dwntn Loop #29 | 16 | 0 | 16 | 0 | 292 | 276 | no | sí | 1 | 0 |
| 231 | Commerce Plaza - Downtown #31 | 18 | 17 | 18 | 0 | 207 | 189 | no | sí | 1 | 0 |
| 235 | South San Rico West Loop #39 | 41 | 41 | 41 | 0 | 171 | 130 | no | sí | 1 | 0 |
| 237 | Pershing Square Metro Loop #21 | 11 | 0 | 11 | 0 | 106 | 95 | no | sí | 1 | 0 |
| 238 | East Side Loop NE #36 | 19 | 0 | 19 | 0 | 195 | 176 | no | sí | 1 | 0 |
| 239 | Picadilly Circus #27 | 52 | 51 | 52 | 0 | 227 | 175 | no | sí | 1 | 0 |
| 241 | East End - Downtown #24 | 28 | 27 | 28 | 0 | 277 | 249 | no | sí | 1 | 0 |
| 242 | Gotham Heights - Downtown #13 | 48 | 47 | 48 | 0 | 315 | 267 | no | sí | 1 | 0 |
| 244 | South Holland - Downtown #17 | 37 | 36 | 37 | 0 | 216 | 179 | no | sí | 1 | 0 |
| 246 | New Ionia-Downtown Express #10 | 65 | 64 | 65 | 0 | 341 | 276 | no | sí | 1 | 0 |
| 248 | Hegewisch - Dwntn Exp #34 | 2 | 0 | 2 | 0 | 36 | 34 | no | sí | 1 | 0 |
| 250 | Florence Heights - DtnExpress #8 | 16 | 0 | 16 | 0 | 153 | 137 | no | sí | 1 | 0 |
| 253 | New Iberia Airport Express #11 | 2 | 0 | 2 | 0 | 52 | 50 | no | sí | 1 | 0 |
| 255 | South Holland - New Corfu #33 | 2 | 0 | 2 | 0 | 32 | 30 | no | sí | 1 | 0 |

### Geometría de districts

| ID | Nombre | Celdas | km² | Polígonos | Huecos | Etiqueta .cslmap dentro |
|---:|---|---:|---:|---:|---:|---|
| 38 | Malibu Island National Park | 4434 | 1.635 | 1 | 0 | sí |
| 39 | South Preston | 2409 | 0.888 | 1 | 0 | sí |
| 40 | Whitney Heights | 1089 | 0.401 | 1 | 0 | sí |
| 41 | Preston | 1760 | 0.649 | 1 | 0 | sí |
| 42 | Auburn | 1381 | 0.509 | 1 | 0 | sí |
| 43 | Aragon | 674 | 0.248 | 1 | 0 | sí |
| 44 | North Hamilton | 3526 | 1.3 | 1 | 0 | sí |
| 45 | Goose Island | 595 | 0.219 | 1 | 0 | sí |
| 46 | Hillside Park | 2958 | 1.09 | 1 | 0 | sí |
| 47 | South San Rico | 33682 | 12.417 | 1 | 0 | sí |
| 48 | San Marco Beach | 15297 | 5.639 | 1 | 0 | sí |
| 49 | Santa Maria Island | 1375 | 0.507 | 1 | 0 | sí |
| 50 | Airport Island | 4120 | 1.519 | 1 | 0 | sí |
| 51 | Alcatraz Island | 432 | 0.159 | 1 | 0 | sí |
| 52 | Redwood Acres | 1041 | 0.384 | 1 | 0 | sí |
| 53 | Redwood Hills | 2428 | 0.895 | 1 | 0 | sí |
| 54 | East Gatwick | 783 | 0.289 | 1 | 0 | sí |
| 55 | Hegewisch | 1760 | 0.649 | 1 | 0 | sí |
| 56 | Riverdale | 1492 | 0.55 | 1 | 0 | sí |
| 57 | Acadia Hills | 1998 | 0.737 | 1 | 0 | sí |
| 58 | West End | 799 | 0.295 | 1 | 0 | sí |
| 59 | Westminster | 2542 | 0.937 | 1 | 0 | sí |
| 60 | Acadiana | 2113 | 0.779 | 1 | 0 | sí |
| 61 | Commerce Plaza | 395 | 0.146 | 1 | 0 | sí |
| 62 | Santa Nueva | 308 | 0.114 | 1 | 0 | sí |
| 63 | Elysia Island | 284 | 0.105 | 1 | 0 | sí |
| 64 | Rhodes Island | 2489 | 0.918 | 1 | 0 | sí |
| 65 | Carthage Island | 1114 | 0.411 | 1 | 0 | sí |
| 66 | Ionia Island | 3467 | 1.278 | 1 | 0 | sí |
| 67 | South Holland | 3387 | 1.249 | 1 | 0 | sí |
| 68 | East End | 3036 | 1.119 | 1 | 0 | sí |
| 69 | Corinthia | 4589 | 1.692 | 1 | 0 | sí |
| 70 | Pershing Square | 153 | 0.056 | 1 | 0 | sí |
| 71 | Carnegie Heights | 2358 | 0.869 | 1 | 0 | sí |
| 72 | Lafayette Square Park | 1947 | 0.718 | 1 | 0 | sí |
| 73 | Picadilly Circus | 1078 | 0.397 | 1 | 0 | sí |
| 74 | Crescent Grove | 814 | 0.3 | 1 | 0 | sí |
| 75 | Ellis Island | 567 | 0.209 | 1 | 0 | sí |
| 76 | Porter | 1211 | 0.446 | 1 | 0 | sí |
| 77 | Wheatfield | 586 | 0.216 | 1 | 0 | sí |
| 78 | Alexandria | 1826 | 0.673 | 1 | 0 | sí |
| 79 | San Andreas Nature Preserve | 2466 | 0.909 | 1 | 0 | sí |
| 80 | Athenia | 1686 | 0.622 | 1 | 0 | sí |
| 81 | Bob Newbie Int'l Airport | 1890 | 0.697 | 1 | 0 | sí |
| 82 | Union Mills | 459 | 0.169 | 1 | 0 | sí |
| 83 | Corfu Island | 1158 | 0.427 | 1 | 0 | sí |
| 84 | Greenwood | 1700 | 0.627 | 1 | 0 | sí |
| 85 | LaSalle Park | 879 | 0.324 | 1 | 0 | sí |
| 86 | Pleasant Grove | 5228 | 1.927 | 1 | 0 | sí |
| 87 | New Corfu | 834 | 0.307 | 1 | 0 | sí |
| 88 | Washington Square Park | 151 | 0.056 | 1 | 0 | sí |
| 89 | Gatwick Park | 37 | 0.014 | 1 | 0 | sí |
| 90 | Gatwick | 3084 | 1.137 | 1 | 0 | sí |
| 91 | Huntington Beach | 5337 | 1.967 | 1 | 0 | sí |
| 92 | New Iberia | 3978 | 1.466 | 1 | 0 | sí |
| 93 | Santa Maria Beach | 5865 | 2.162 | 1 | 0 | sí |
| 94 | San Rico Beach | 4014 | 1.48 | 1 | 0 | sí |
| 95 | Ogden Dunes | 4090 | 1.508 | 1 | 0 | sí |
| 96 | Millenium Park | 192 | 0.071 | 1 | 0 | sí |
| 97 | New Downtown | 1266 | 0.467 | 1 | 1 | sí |
| 98 | Corfu Harbor | 5852 | 2.157 | 1 | 0 | sí |
| 99 | Wicker Park | 183 | 0.067 | 1 | 0 | sí |
| 100 | Anthem Heights | 836 | 0.308 | 1 | 0 | sí |
| 101 | Lincoln Park | 163 | 0.06 | 1 | 0 | sí |
| 102 | Florence Heights | 1501 | 0.553 | 1 | 0 | sí |
| 103 | Greenwich | 854 | 0.315 | 1 | 0 | sí |
| 104 | Hickory Hills | 788 | 0.29 | 1 | 0 | sí |
| 105 | Harlem | 2507 | 0.924 | 1 | 0 | sí |
| 106 | Aborigina | 1209 | 0.446 | 1 | 0 | sí |
| 107 | Spartacus | 2770 | 1.021 | 1 | 1 | sí |
| 108 | Old Downtown | 1825 | 0.673 | 1 | 0 | sí |
| 109 | Oak Grove Heights | 1327 | 0.489 | 1 | 0 | sí |
| 110 | Gotham Heights | 1647 | 0.607 | 1 | 0 | sí |
| 111 | Nazareth Heights | 1215 | 0.448 | 1 | 0 | sí |
| 112 | Humboldt Park | 1471 | 0.542 | 1 | 0 | sí |
| 113 | San Rico Waste Facility | 1699 | 0.626 | 1 | 0 | sí |
| 114 | New Actor | 2341 | 0.863 | 1 | 0 | sí |
| 115 | Little San Rico Island | 3233 | 1.192 | 1 | 0 | sí |
| 116 | Meadows Heights | 3497 | 1.289 | 1 | 0 | sí |
| 117 | Harvey | 1248 | 0.46 | 1 | 0 | sí |
| 118 | Lafayette Park | 442 | 0.163 | 1 | 0 | sí |
| 119 | Rachel Carson National Park | 779 | 0.287 | 1 | 0 | sí |
| 120 | Hyde Park | 1930 | 0.711 | 1 | 0 | sí |
| 121 | Vanderbilt Park | 516 | 0.19 | 1 | 0 | sí |
| 122 | Amity Park | 264 | 0.097 | 1 | 0 | sí |
| 123 | Inglewood | 1544 | 0.569 | 1 | 0 | sí |
| 124 | Big San Rico Island | 2284 | 0.842 | 1 | 0 | sí |
| 125 | Glenn Park | 1094 | 0.403 | 1 | 0 | sí |
| 126 | Rockefeller Park | 487 | 0.18 | 1 | 0 | sí |
| 127 | New Ionia | 2571 | 0.948 | 1 | 0 | sí |

### Geometría de parks

| ID | Nombre | Celdas | km² | Polígonos | Huecos | Etiqueta .cslmap dentro |
|---:|---|---:|---:|---:|---:|---|

## springvalley-2026-09-22

Captura: parcial
Dominios no soportados: water, dlcs, mods

| Dominio | Categoría | Conteo raw |
|---|---|---:|
| roads | unresolved | 10459 |
| transit | unresolved | 75 |
| buildings | unresolved | 12052 |
| districts | unresolved | 20 |
| vegetation | unresolved | 249880 |
| parks | unresolved | 0 |
| terrain | unresolved | — |
| water | unresolved | — |

### Rutas de tránsito

| ID | Línea | Paradas | En calle con nombre | Tramos | Sin ruta | Posiciones raw | Posiciones .cslmap | Misma secuencia | .cslmap ⊂ raw | Solapamiento | Segmentos .cslmap inexistentes |
|---:|---|---:|---:|---:|---:|---:|---:|---|---|---:|---:|
| 2 | Bus Line 26 | 2 | 0 | 2 | 0 | 165 | 163 | no | sí | 1 | 0 |
| 5 | Bus Line 37 | 2 | 1 | 2 | 0 | 106 | 104 | no | sí | 1 | 0 |
| 11 | Bus Line 12 | 21 | 21 | 21 | 0 | 182 | 161 | no | sí | 1 | 0 |
| 22 | Bus Line 17 | 2 | 0 | 2 | 0 | 66 | 64 | no | sí | 1 | 0 |
| 28 | Metro Line 1 | 11 | 0 | 11 | 0 | 133 | 122 | no | sí | 1 | 0 |
| 33 | Bus Line 19 | 3 | 0 | 3 | 0 | 139 | 136 | no | sí | 1 | 0 |
| 34 | Line 3 – Blimp | 6 | 0 | 6 | 0 | 62 | 56 | no | sí | 1 | 0 |
| 36 | Bus Line 28 | 2 | 0 | 2 | 0 | 173 | 171 | no | sí | 1 | 0 |
| 39 | Bus Line 34 | 9 | 8 | 9 | 0 | 163 | 154 | no | sí | 1 | 0 |
| 40 | Bus Line 41 | 2 | 1 | 2 | 0 | 139 | 137 | no | sí | 1 | 0 |
| 44 | Bus Line 11 | 4 | 1 | 4 | 0 | 168 | 164 | no | sí | 1 | 0 |
| 45 | Bus Line 7 | 3 | 1 | 3 | 0 | 77 | 74 | no | sí | 1 | 0 |
| 47 | Bus Line 21 | 2 | 0 | 2 | 0 | 158 | 156 | no | sí | 1 | 0 |
| 48 | Bus Line 32 | 2 | 0 | 2 | 0 | 206 | 204 | no | sí | 1 | 0 |
| 55 | Ferry Line 2 | 4 | 0 | 4 | 0 | 73 | 69 | no | sí | 1 | 0 |
| 57 | Bus Line 24 | 9 | 8 | 9 | 0 | 93 | 84 | no | sí | 1 | 0 |
| 60 | Metro Line 4 | 10 | 0 | 10 | 0 | 199 | 190 | no | sí | 1 | 0 |
| 66 | Bus Line 18 | 3 | 1 | 3 | 0 | 82 | 79 | no | sí | 1 | 0 |
| 70 | Metro Line 10 | 18 | 0 | 18 | 0 | 409 | 392 | no | sí | 1 | 0 |
| 77 | Bus Line 36 | 4 | 3 | 4 | 0 | 107 | 103 | no | sí | 1 | 0 |
| 79 | Metro Line 9 | 2 | 0 | 2 | 0 | 48 | 46 | no | sí | 1 | 0 |
| 80 | Bus Line 27 | 2 | 0 | 2 | 0 | 209 | 207 | no | sí | 1 | 0 |
| 85 | Bus Line 6 | 7 | 7 | 7 | 0 | 59 | 52 | no | sí | 1 | 0 |
| 93 | Bus Line 20 | 2 | 0 | 2 | 0 | 122 | 120 | no | sí | 1 | 0 |
| 94 | Bus Line 33 | 8 | 7 | 8 | 0 | 91 | 83 | no | sí | 1 | 0 |
| 95 | Metro Line 2 | 4 | 0 | 4 | 0 | 39 | 35 | no | sí | 1 | 0 |
| 103 | Monorail Line 17 | 6 | 0 | 6 | 0 | 206 | 200 | no | sí | 1 | 0 |
| 105 | Bus Line 4 | 4 | 3 | 4 | 0 | 85 | 81 | no | sí | 1 | 0 |
| 107 | Line 4 – Blimp | 10 | 0 | 10 | 0 | 172 | 162 | no | sí | 1 | 0 |
| 110 | Line 1 – Blimp | 6 | 0 | 6 | 0 | 121 | 115 | no | sí | 1 | 0 |
| 116 | Ferry Line 3 | 8 | 0 | 8 | 0 | 225 | 217 | no | sí | 1 | 0 |
| 117 | Monorail Line 11 | 6 | 0 | 6 | 0 | 88 | 82 | no | sí | 1 | 0 |
| 118 | Metro Line 3 | 2 | 0 | 2 | 0 | 32 | 30 | no | sí | 1 | 0 |
| 122 | Bus Line 23 | 11 | 10 | 11 | 0 | 95 | 84 | no | sí | 1 | 0 |
| 127 | Line 5 – Blimp | 5 | 0 | 5 | 0 | 131 | 126 | no | sí | 1 | 0 |
| 129 | Monorail Line 13 | 4 | 1 | 4 | 0 | 102 | 98 | no | sí | 1 | 0 |
| 131 | Monorail Line 14 | 5 | 1 | 5 | 0 | 106 | 101 | no | sí | 1 | 0 |
| 132 | Bus Line 15 | 2 | 1 | 2 | 0 | 87 | 85 | no | sí | 1 | 0 |
| 141 | Metro Line 7 | 2 | 0 | 2 | 0 | 76 | 74 | no | sí | 1 | 0 |
| 147 | Monorail Line 12 | 5 | 1 | 5 | 0 | 86 | 81 | no | sí | 1 | 0 |
| 149 | Metro Line 8 | 2 | 0 | 2 | 0 | 52 | 50 | no | sí | 1 | 0 |
| 151 | Bus Line 35 | 7 | 7 | 7 | 0 | 73 | 66 | no | sí | 1 | 0 |
| 152 | Bus Line 40 | 2 | 1 | 2 | 0 | 115 | 113 | no | sí | 1 | 0 |
| 157 | Metro Line 5 | 2 | 0 | 2 | 0 | 50 | 48 | no | sí | 1 | 0 |
| 159 | Bus Line 30 | 2 | 0 | 2 | 0 | 177 | 175 | no | sí | 1 | 0 |
| 169 | Monorail Line 7 | 2 | 1 | 2 | 0 | 36 | 34 | no | sí | 1 | 0 |
| 171 | Line 6 – Blimp | 3 | 0 | 3 | 0 | 80 | 77 | no | sí | 1 | 0 |
| 174 | Bus Line 10 | 22 | 19 | 22 | 0 | 251 | 229 | no | sí | 1 | 0 |
| 182 | Monorail Line 8 | 2 | 1 | 2 | 0 | 36 | 34 | no | sí | 1 | 0 |
| 189 | Line 2 – Blimp | 6 | 0 | 6 | 0 | 122 | 116 | no | sí | 1 | 0 |
| 190 | Bus Line 22 | 4 | 3 | 4 | 0 | 55 | 51 | no | sí | 1 | 0 |
| 192 | Bus Line 13 | 7 | 7 | 7 | 0 | 68 | 61 | no | sí | 1 | 0 |
| 193 | Monorail Line 15 | 12 | 2 | 12 | 0 | 273 | 261 | no | sí | 1 | 0 |
| 200 | Bus Line 38 | 6 | 6 | 6 | 0 | 78 | 72 | no | sí | 1 | 0 |
| 202 | Ferry Line 1 | 6 | 0 | 6 | 0 | 166 | 160 | no | sí | 1 | 0 |
| 205 | Train Line 1 | 8 | 0 | 8 | 0 | 458 | 450 | no | sí | 1 | 0 |
| 209 | Bus Line 8 | 7 | 6 | 7 | 0 | 97 | 90 | no | sí | 1 | 0 |
| 210 | Bus Line 14 | 6 | 6 | 6 | 0 | 82 | 76 | no | sí | 1 | 0 |
| 211 | Train Line 3 | 5 | 0 | 5 | 0 | 182 | 177 | no | sí | 1 | 0 |
| 212 | Bus Line 25 | 2 | 1 | 2 | 0 | 54 | 52 | no | sí | 1 | 0 |
| 213 | Bus Line 1 | 13 | 12 | 13 | 0 | 158 | 145 | no | sí | 1 | 0 |
| 221 | Bus Line 2 | 10 | 7 | 10 | 0 | 149 | 139 | no | sí | 1 | 0 |
| 223 | Metro Line 11 | 3 | 0 | 3 | 0 | 37 | 34 | no | sí | 1 | 0 |
| 225 | Train Line 0 | 0 | 0 | 0 | 0 | 0 | 0 | sí | sí | 1 | 0 |
| 228 | Bus Line 16 | 8 | 6 | 8 | 0 | 133 | 125 | no | sí | 1 | 0 |
| 232 | Bus Line 9 | 2 | 0 | 2 | 0 | 73 | 71 | no | sí | 1 | 0 |
| 237 | Metro Line 6 | 2 | 0 | 2 | 0 | 58 | 56 | no | sí | 1 | 0 |
| 242 | Bus Line 39 | 2 | 1 | 2 | 0 | 74 | 72 | no | sí | 1 | 0 |
| 243 | Monorail Line 16 | 2 | 0 | 2 | 0 | 54 | 52 | no | sí | 1 | 0 |
| 244 | Bus Line 29 | 2 | 0 | 2 | 0 | 139 | 137 | no | sí | 1 | 0 |
| 247 | Train Line 2 | 6 | 0 | 6 | 0 | 228 | 222 | no | sí | 1 | 0 |
| 248 | Monorail Line 18 | 4 | 0 | 4 | 0 | 141 | 137 | no | sí | 1 | 0 |
| 250 | Monorail Line 9 | 3 | 1 | 3 | 2 | 22 | 35 | no | no | 0.563 | 0 |
| 254 | Bus Line 31 | 2 | 0 | 2 | 0 | 199 | 197 | no | sí | 1 | 0 |
| 255 | Bus Line 5 | 5 | 4 | 5 | 0 | 103 | 98 | no | sí | 1 | 0 |

### Geometría de districts

| ID | Nombre | Celdas | km² | Polígonos | Huecos | Etiqueta .cslmap dentro |
|---:|---|---:|---:|---:|---:|---|
| 108 | Crest District | 378 | 0.139 | 1 | 0 | sí |
| 109 | Crescent Park | 368 | 0.136 | 1 | 0 | sí |
| 110 | Poplar Square | 299 | 0.11 | 1 | 0 | sí |
| 111 | Valley Park | 206 | 0.076 | 1 | 0 | sí |
| 112 | Aspen Hills | 895 | 0.33 | 1 | 0 | sí |
| 113 | Linden Square | 2728 | 1.006 | 1 | 0 | sí |
| 114 | Chester Heights | 1744 | 0.643 | 1 | 0 | sí |
| 115 | Elm Hills | 2037 | 0.751 | 1 | 0 | sí |
| 116 | Birch Park | 733 | 0.27 | 1 | 0 | sí |
| 117 | Robin District | 815 | 0.3 | 1 | 0 | sí |
| 118 | Barlow Hills | 207 | 0.076 | 1 | 0 | sí |
| 119 | Briarwood Park | 154 | 0.057 | 1 | 0 | sí |
| 120 | Brook District | 7041 | 2.596 | 1 | 0 | sí |
| 121 | Linden District | 801 | 0.295 | 1 | 0 | sí |
| 122 | Umber Square | 1101 | 0.406 | 1 | 0 | sí |
| 123 | Umber District | 2070 | 0.763 | 1 | 0 | sí |
| 124 | Primrose Hills | 961 | 0.354 | 1 | 0 | sí |
| 125 | Hemlock Park | 752 | 0.277 | 1 | 0 | sí |
| 126 | Belmont Square | 2186 | 0.806 | 1 | 0 | sí |
| 127 | Elk District | 392 | 0.145 | 1 | 0 | sí |

### Geometría de parks

| ID | Nombre | Celdas | km² | Polígonos | Huecos | Etiqueta .cslmap dentro |
|---:|---|---:|---:|---:|---:|---|

## westdale-2026-09-22

Captura: parcial
Dominios no soportados: water, dlcs, mods

| Dominio | Categoría | Conteo raw |
|---|---|---:|
| roads | unresolved | 13119 |
| transit | unresolved | 0 |
| buildings | unresolved | 39623 |
| districts | unresolved | 7 |
| vegetation | unresolved | 541 |
| parks | unresolved | 0 |
| terrain | unresolved | — |
| water | unresolved | — |

### Rutas de tránsito

| ID | Línea | Paradas | En calle con nombre | Tramos | Sin ruta | Posiciones raw | Posiciones .cslmap | Misma secuencia | .cslmap ⊂ raw | Solapamiento | Segmentos .cslmap inexistentes |
|---:|---|---:|---:|---:|---:|---:|---:|---|---|---:|---:|

### Geometría de districts

| ID | Nombre | Celdas | km² | Polígonos | Huecos | Etiqueta .cslmap dentro |
|---:|---|---:|---:|---:|---:|---|
| 121 | Prospect Park | 203 | 0.075 | 1 | 0 | sí |
| 122 | Amity Square | 127 | 0.047 | 1 | 0 | sí |
| 123 | Lilac Hills | 107 | 0.039 | 1 | 0 | sí |
| 124 | King Heights | 194 | 0.072 | 1 | 0 | sí |
| 125 | Lilac Heights | 122 | 0.045 | 1 | 0 | sí |
| 126 | Rosewood Hills | 198 | 0.073 | 1 | 0 | sí |
| 127 | Highland Park | 704 | 0.26 | 1 | 0 | sí |

### Geometría de parks

| ID | Nombre | Celdas | km² | Polígonos | Huecos | Etiqueta .cslmap dentro |
|---:|---|---:|---:|---:|---:|---|
