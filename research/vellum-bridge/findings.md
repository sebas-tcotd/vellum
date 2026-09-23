# Hallazgos del spike Vellum Bridge (Story 5.1)

Evidencia: 10 pares sincronizados `.cslmap` + Raw Snapshot capturados el 2026-09-22 con CS1 `1.21.1-f9` y Bridge `0.1.0-experimental` (ver `reports/comparison.md`, sección "Resumen del corpus"). Las 10 capturas se declaran parciales porque agua, DLC y mods no se extraen. Los números de este documento salen de ese reporte; las categorías y la confianza son revisión humana, no salida automática.

Confianza: **alta** = observado en los 10 pares y contrastado por ID; **media** = observado, pero la correspondencia con `.cslmap` solo se comprobó por conteos; **baja** = una sola versión del juego o señal ambigua.

## Por dominio

| Dominio                      | Categoría      | Confianza | Evidencia                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------- | -------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Metadatos                    | `raw-only`     | alta      | Nombre de ciudad, versión de juego y fecha de captura en los 10 snapshots. Solo una versión de juego observada.                                                                                                                                                                                                                                                              |
| Red vial                     | `transformed`  | media     | 10/10 ciudades. Raw expone más segmentos que `.cslmap` en todas (p. ej. San Rico 31 430 vs 20 643): `.cslmap` filtra, pero el criterio no está verificado por ID. Nombres visibles de calles disponibles vía `GetSegmentName`.                                                                                                                                               |
| Tránsito — rutas             | `transformed`  | alta      | 308 líneas con paradas, todas presentes en `.cslmap` por ID. En 306 la ruta `.cslmap` es subsecuencia del camino crudo del pathfinder (difiere solo por la posición repetida por tramo). Excepciones: `altavento-2026-09-22#103` (2 segmentos `.cslmap` no existen en la ciudad) y `springvalley-2026-09-22#250`. 6 tramos sin camino calculado (aurelia 4, springvalley 2). |
| Tránsito — nombres de línea  | `unresolved`   | media     | `GetLineName` devuelve nombre en todas las líneas; la igualdad con el nombre de `.cslmap` no se comparó.                                                                                                                                                                                                                                                                     |
| Tránsito — nombres de parada | `not-observed` | alta      | `stopCustomNames` vacío en 3 686 paradas: CS1 base no nombra paradas y ningún mod del corpus lo hizo. 2 693 (73 %) están sobre una calle con nombre.                                                                                                                                                                                                                         |
| Edificios                    | `transformed`  | media     | Raw > `.cslmap` en 10/10 (p. ej. Pepper Lake 19 269 vs 17 985). Raw añade `service/subService/level` y nombre visible de no-RICO/renombrados.                                                                                                                                                                                                                                |
| Distritos                    | `transformed`  | alta      | Geometría derivada de la grilla raw; 217/217 etiquetas `.cslmap` caen dentro de su área. Las 10 restantes son el distrito 0 que `.cslmap` exporta con nombre generado: artefacto del exportador, no un distrito.                                                                                                                                                             |
| Parques / áreas DLC          | `transformed`  | alta      | 36/36 etiquetas dentro de su área. Raw conserva `parkType` completo (Costa Tijuca: 13 tipos, incl. Zoo, Airport, PedestrianZone); el parser de Vellum reduce los no soportados a `None`.                                                                                                                                                                                     |
| Vegetación                   | `unresolved`   | baja      | Raw captura árboles individuales; `.cslmap` exporta celdas de bosque. Dos anomalías: San Rico da exactamente 262 143 árboles (buffer vanilla lleno: posible truncado por un mod de árboles ilimitados) y Westdale da 541 árboles frente a 61 760 celdas de bosque.                                                                                                           |
| Terreno                      | `derived`      | media     | Raw: alturas crudas 1081×1081. `.cslmap`: polígono de tierra y curvas de nivel derivados.                                                                                                                                                                                                                                                                                    |
| Agua                         | `cslmap-only`  | —         | No extraído por Bridge (`diagnostics.unsupported`). No implica ausencia en la API.                                                                                                                                                                                                                                                                                           |
| DLC / mods                   | `not-observed` | —         | No extraído. El `parkType` es la única señal indirecta de DLC.                                                                                                                                                                                                                                                                                                               |

## Decisión sobre nombres de parada (AC3)

**Aprobada por Sebas (2026-09-22):** Vellum no promete nombres de parada propios del juego en v1.0. El futuro contrato deriva el nombre de la calle de la parada (`stopRoadSegments` + nombre de calle, 73 % del corpus) y lo marca como derivado:

- Una sola parada en la calle: `<nombre de calle>`.
- Varias paradas en la misma calle: `<nombre de calle> N`, con un orden determinista que define Story 5.2.
- La vista esquemática puede usar una forma abreviada de ese nombre.
- Sin calle con nombre: la parada queda sin nombre.

`stopCustomNames` se conserva como campo opcional y tiene prioridad si un mod lo asigna.

## Verificación manual

- 2026-09-22, Sebas: la captura no produce snapshot durante guardado/autoguardado ni ante un fallo forzado.

## Pendiente para Story 5.2

- Revisar las anomalías de vegetación antes de usar ese dominio.
