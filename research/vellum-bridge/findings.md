# Hallazgos del spike Vellum Bridge (Story 5.1)

Evidencia: 10 pares sincronizados `.cslmap` + Raw Snapshot capturados el 2026-09-22 con CS1 `1.21.1-f9` y Bridge `0.1.0-experimental` (ver `reports/comparison.md`, sección "Resumen del corpus"). Las 10 capturas se declaran parciales porque agua, DLC y mods no se extraen. Los números de este documento salen de ese reporte; las categorías y la confianza son revisión humana, no salida automática.

`equivalent` = mismo dato crudo en ambos lados, sin pérdida.

Confianza: **alta** = observado en los 10 pares y contrastado por ID; **media** = observado, pero la correspondencia con `.cslmap` solo se comprobó por conteos; **baja** = una sola versión del juego o señal ambigua.

## Por dominio

| Dominio                      | Categoría      | Confianza | Evidencia                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------- | -------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Metadatos                    | `raw-only`     | alta      | Nombre de ciudad, versión de juego y fecha de captura en los 10 snapshots. Solo una versión de juego observada.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Red vial                     | `transformed`  | alta      | Comparado por ID en 4 pares sincronizados: `.cslmap` nunca trae un segmento que no esté en raw, y filtra exactamente las redes no viales o invisibles por prefab: `Water Pipe` (5 882 en San Rico), `Airplane Path`, `Ship Path`, `Pedestrian Connection*` (caminos internos de edificios) y `Cargo`/`Airplane`/`Ship Connection`. La única excepción (`island-hopping#16974`, un túnel) no tiene el flag `Created`: es un segmento en transición. Nombres visibles de calles disponibles con `GetSegmentName`.                                                                                                                                                                                                                                                                                       |
| Tránsito — rutas             | `transformed`  | alta      | 308 líneas con paradas, todas presentes en `.cslmap` por ID. En 306 la ruta `.cslmap` es subsecuencia del camino crudo del pathfinder (difiere solo por la posición repetida por tramo). Excepciones: `altavento-2026-09-22#103` (2 segmentos `.cslmap` no existen en la ciudad) y `springvalley-2026-09-22#250`. 6 tramos sin camino calculado (aurelia 4, springvalley 2).                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Tránsito — nombres de línea  | `equivalent`   | alta      | `GetLineName` coincide con el nombre de `.cslmap` en las 497 líneas emparejadas por ID (15 pares). Color: `.cslmap` exporta el color **visible** (`#RRGGBBAA`). El `m_color` crudo solo vale con el flag `CustomColor`; sin él, el juego usa el color por defecto del modo. Con Bridge 0.5, `displayColor` (`TransportManager.GetLineColor`) coincide en las 23 líneas reales de `costa-tijuca-2026-09-23-pausa`, 12 de ellas sin `CustomColor` y de 5 modos. La única diferencia es la línea 168: 0 paradas y flags `Temporary, Hidden`, o sea la vista previa de la herramienta de líneas, no una línea real.                                                                                                                                                                                       |
| Tránsito — nombres de parada | `not-observed` | alta      | `stopCustomNames` vacío en 3 686 paradas: CS1 base no nombra paradas y ningún mod del corpus lo hizo. 2 693 (73 %) están sobre una calle con nombre.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Edificios                    | `transformed`  | alta      | Comparado por ID en 4 pares sincronizados: `.cslmap` nunca trae un edificio que no esté en raw. Lo que falta son estructuras de red con flag `Untouchable`: 6 096 en total, sobre todo `Water Pipe Junction`, pilares de autopista y ferrocarril y postes eléctricos. Pero el exportador incluye 506 `Untouchable` (pilares de metro, casetas de peaje, conexiones de avión y barco), así que su criterio no sigue una regla uniforme. La otra ausencia (`san-rico#6736`) no tiene `Created`. Raw añade `service`/`subService`/`level` y el nombre visible de edificios que no son RICO o fueron renombrados.                                                                                                                                                                                         |
| Distritos                    | `transformed`  | alta      | Geometría derivada de la grilla raw; 217/217 etiquetas `.cslmap` caen dentro de su área. Las 10 restantes son el distrito 0 que `.cslmap` exporta con nombre generado: artefacto del exportador, no un distrito.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Parques / áreas DLC          | `transformed`  | alta      | 36/36 etiquetas dentro de su área. Raw conserva `parkType` completo (Costa Tijuca: 13 tipos, incl. Zoo, Airport, PedestrianZone); el parser de Vellum reduce los no soportados a `None`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Vegetación                   | `derived`      | alta      | `<Forest>` de `.cslmap` **es `NaturalResourceManager.m_tree`**: coincide en las 262 144 celdas de `san-rico-2026-09-23-pausa` y de `westdale-2026-09-23-pausa` (Bridge 0.4). El juego calcula `m_tree` a partir de los árboles vivos; en 8 de 10 ciudades más del 90 % de las celdas de bosque coincide con la densidad recalculada desde los árboles crudos. Raw añade cada árbol con su posición y especie (`prefab`; 34 especies en Altavento). Excepciones: en San Rico (262 143 árboles, buffer vanilla de 262 144 lleno) y Westdale (541 árboles, 61 760 celdas con `m_tree`), `m_tree` refleja árboles que el buffer de `TreeManager` no contiene. Hipótesis sin verificar: un mod de límite de árboles los guarda aparte. Mientras Bridge no capture la lista de mods, no se puede confirmar. |
| Terreno                      | `derived`      | alta      | Raw: alturas crudas 1081×1081. `.cslmap`: polígono de tierra y curvas de nivel derivados. `<Ter>` exporta **`RawHeights2`**, no `RawHeights`: en `island-hopping-2026-09-23-pausa` las dos difieren en 813 celdas y `RawHeights2` explica las 813 (`BlockHeights`, 667). En esas celdas no hay agua, `RawHeights2` queda sobre el mar en las 813 y `RawHeights` bajo el mar en 257: el terreno visible es `RawHeights2`. Confirmado en San Rico (34/34) y Westdale (322/322). En Altavento `<Ter>` coincide con `RawHeights` en todas las celdas.                                                                                                                                                                                                                                                     |
| Agua                         | `equivalent`   | alta      | Par sincronizado `altavento-2026-09-23-pausa` (Bridge 0.2.0): `res` de `<Ter>` **es la profundidad cruda** `Cell.m_height` (366 865 de 367 099 celdas iguales) y la máscara mojada coincide exacta (Jaccard 1). `SeaLevel` de `.cslmap` está en metros y coincide con la cota modal del agua cruda (187 m). Raw añade las fuentes de agua (`type`, `target`, caudales). Island Hopping (captura no sincronizada) tiene mar a 160 m sin fuentes naturales: el nivel del mar es un escalar del juego, no una fuente.                                                                                                                                                                                                                                                                                    |
| DLC / mods                   | `not-observed` | —         | No extraído. El `parkType` es la única señal indirecta de DLC.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

## Decisión sobre nombres de parada (AC3)

**Aprobada por Sebas (2026-09-22):** Vellum no promete nombres de parada propios del juego en v1.0. El futuro contrato deriva el nombre de la calle de la parada (`stopRoadSegments` + nombre de calle, 73 % del corpus) y lo marca como derivado:

- Una sola parada en la calle: `<nombre de calle>`.
- Varias paradas en la misma calle: `<nombre de calle> N`, con un orden determinista que define Story 5.2.
- La vista esquemática puede usar una forma abreviada de ese nombre.
- Sin calle con nombre: la parada queda sin nombre.

`stopCustomNames` se conserva como campo opcional y tiene prioridad si un mod lo asigna.

## Qué entra al documento nativo (calles y edificios)

- Solo elementos con flag `Created`: las ausencias no explicadas por prefab son elementos en transición.
- Líneas de transporte: se excluyen las que tienen flag `Temporary` (vista previa de la herramienta de líneas, sin paradas).
- Las redes invisibles o no viales (tuberías, rutas de avión y barco, conexiones) se clasifican por prefab en vez de descartarse: son datos de la ciudad que un tema puede ocultar.
- Las estructuras `Untouchable` (pilares, uniones, postes, casetas de peaje) se marcan como estructura de red y el renderer decide si las dibuja. No se copia el filtro de `.cslmap`, que no sigue una regla uniforme.

## Agua: pausa frente a simulación corriendo

Misma sesión de Altavento, capturada en pausa y 8 s después con Ctrl+Shift+V (188 frames de agua):

- La profundidad cambia en 361 918 celdas (prácticamente toda el agua): 0,52 m de media y 3,7 m como máximo. Tras 8 s de simulación, `res = profundidad` baja de 366 865 a 5 469 celdas.
- La máscara mojada (profundidad > 25 cm) solo cambia en 550 celdas (0,15 %).
- Consecuencia para el formato nativo: la **forma** del agua es estable y la profundidad no. Si una captura se hace con la simulación corriendo, ya no se puede comparar celda a celda con un `.cslmap` exportado en otro momento.

Hallazgo lateral: el parser de `.cslmap` comparaba `res` (profundidad, unidades crudas) con `SeaLevel` (metros) y descartaba el agua más somera que `SeaLevel / 64` m, una franja de 16-32 m en cada orilla. Corregido en PR #105.

## Decisiones para la Story 5.2

Tomadas con Sebas en la party mode del 2026-09-22/23. Cada una se apoya en la evidencia de las tablas de arriba.

**Dirección y formato**

- **Dirección:** el formato nativo, derivado de los Raw Snapshots, es el predeterminado de Vellum. `.cslmap` queda como retrocompatibilidad y puede verse incompleto.
- **Contenedor:** un zip con un `manifest.json` versionado y validable con JSON Schema, y un archivo por módulo (terreno, agua, calles, tránsito, edificios, distritos y parques, vegetación). Los módulos JSON tienen su propio schema. Los binarios (grillas `uint16`) los declara el manifest con resolución, codificación y hash, y el adapter los verifica. Primer corte: solo el terreno es binario; convertir otro módulo requiere medirlo antes. Motivo: el snapshot de San Rico pesa 75,4 MB en JSON y 11,9 MB comprimido; las grillas de distrito y parque ocupan 16 MB en base64 y comprimen a 0,2 MB.
- **Extensiones:**
  - `.vellummap`: el documento principal que exporta Bridge.
  - `.quire`: export opcional de diagnóstico. Es la captura cruda, pensada para reportes de errores.
  - `.vellum` queda descartado: lo usan una app de libros de 180g y un editor vectorial.
  - `.quire` no tiene dueño conocido.

**Contenido por dominio**

- **Terreno:** `RawHeights2`, que es la capa visible y la que exporta `.cslmap`.
- **Agua:** mojado significa profundidad > 25 cm, y el nivel del mar se guarda como escalar. La máscara es el contrato estable. La profundidad capturada en pausa va como dato opcional con su procedencia.
- **Vegetación:** `m_tree` como densidad completa. Los árboles individuales (posición y especie) son opcionales, porque con mods de límite de árboles pueden estar incompletos.
- **Calles y edificios:** según la sección "Qué entra al documento nativo".
- **Tránsito:**
  - nombres con `GetLineName`;
  - color visible con `displayColor`;
  - nombres de parada derivados de la calle y marcados como derivados; `stopCustomNames` tiene prioridad si un mod lo asignó.

**Metadatos y alcance**

- **Metadatos para el futuro timelapse:** el manifest guarda desde la primera versión la fecha del juego (`SimulationManager.m_currentGameTime`) y la identidad de la partida (`m_metaData.m_gameInstanceIdentifier`, un GUID). Advertencia: algunos mods lo regeneran, así que no sirve como única identidad. El dato que no se guarda hoy no existe mañana.
- **Identidad de elementos:** los IDs de CS1 son posiciones de buffer que se reutilizan. Comparar dos exportaciones exige ID más huella (prefab y posiciones).
- **Campos del manifest v1 que evitan romper el formato después** (deep research de timelapse, `planning-artifacts/research/technical-timelapse-historial-vellum-2026-09-23/research.md`):
  1. `snapshotId`, `parentSnapshotId` (opcional, para representar ramas del historial), `exportedAtUtc` y `gameTime`, por separado. El tiempo del juego no es un orden fiable.
  2. Un `codec` por módulo. v1 puede usar deflate y pasar a zstd sin romper lectores.
  3. Hash del contenido canónico de cada módulo, la base de la deduplicación futura.
  4. El ID de CS1 se guarda como `sourceId`, dejando libre `lineageId` para la identidad histórica.
  5. `exportSchemaVersion` más una versión por módulo.
- **Solo formato nativo, post-v1:** terreno 3D, carta náutica (batimetría) y timelapse.

## Verificación manual

- 2026-09-22, Sebas: la captura no produce snapshot durante guardado/autoguardado ni ante un fallo forzado.

## Pendiente para Story 5.2

- Vegetación: los árboles individuales son incompletos en ciudades con mods de límite de árboles; `m_tree` es la señal completa. Capturar la lista de mods (hoy `unsupported`) confirmaría la causa.
- Agua en el contrato nativo: mojado = profundidad > 25 cm (`MIN_WATER_DEPTH` del parser) y el nivel del mar como escalar. Hay que decidir si se guarda la profundidad o solo la máscara, y documentar la regla océano/interior como derivada.
- Terreno en el contrato nativo: usar `RawHeights2` (lo que se ve y lo que exporta `.cslmap`). Qué modifica `RawHeights` para producirlo, probablemente edificios o redes que rellenan terreno, sigue sin verificar.
