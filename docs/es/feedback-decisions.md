# Decisiones de feedback

Este registro dice qué pasó con cada propuesta que llegó de la comunidad: si se
adoptó, si se difirió, si se descartó o si el formato de datos todavía no la
permite. Existe para que una idea no se convierta en funcionalidad por inercia
ni desaparezca en silencio, y para que cualquiera pueda abrir la evidencia en la
que se apoyó la decisión.

- [English](../en/feedback-decisions.md)
- [Índice de documentación](index.md)

Es un registro de producto. No sustituye a los
[ADR](../adr/0001-rendering-ownership.md), que documentan decisiones de
arquitectura, ni al backlog técnico `deferred-work.md`, que recoge trabajo
diferido de las code reviews.

Una aclaración sobre las citas, porque este registro promete evidencia abrible:
lo que aparece entre backticks y empieza por `packages/`, `apps/`, `scripts/` o
`docs/` es una ruta de este repositorio y se puede abrir tal cual. En cambio los
artefactos de planificación —el plan de épicas v1.0, el documento de entrada
`Reddit reception evidence, August 2026`, `deferred-work.md` y las referencias a
Epic 1 o Epic 5— viven en el espacio de trabajo de planificación del mantenedor,
fuera de este repositorio; por eso se citan por nombre y nunca como enlace.

## Vocabulario de estados

Una entrada declara exactamente uno de estos cuatro estados.

| Estado                  | Qué significa                                                                                                                    |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **adoptada**            | Se implementará. Hay necesidad de usuario, dato realmente disponible y una prueba o fixture que la aceptará.                     |
| **diferida**            | Es razonable, pero no ahora. Nombra hacia dónde se difiere.                                                                      |
| **descartada**          | No se hará, y la razón es de producto o de contrato, no de calendario.                                                           |
| **bloqueada por datos** | El dato que exige no existe en `.cslmap`. Se difiere hacia una fuente más rica y no se promete representación en el mapa actual. |

## Campos obligatorios por estado

Toda entrada declara `Estado`, `Origen` y `Razón`. La razón es breve y se ancla
en evidencia abrible desde el propio texto: una ruta de archivo, un símbolo, un
fixture o el plan de épicas.

| Estado                        | Campos adicionales            |
| ----------------------------- | ----------------------------- |
| adoptada                      | `Necesidad`, `Dato`, `Prueba` |
| diferida, bloqueada por datos | `Destino`                     |
| descartada                    | ninguno                       |

`scripts/verify-feedback-decisions.mjs` verifica esta forma en cada
ejecución de `pnpm test:scripts`, en ambos idiomas, y exige que los dos árboles
declaren los mismos ids y los mismos estados.

## Regla de supersesión

Una decisión no se reescribe en su sitio. Cuando cambia por nueva evidencia, la
entrada conserva todos sus campos anteriores y añade una línea final de
revisión:

```markdown
- **Revisión 2026-11-04:** antes «bloqueada por datos»; cambió a «adoptada»
  porque el spike de CS1 confirmó que la API expone el dato.
```

El campo `Estado` sí se actualiza al valor vigente —es lo que se lee de un
vistazo—, pero la línea de revisión deja escrito de qué estado se venía y por
qué. Así la historia de la decisión queda en el archivo y en el historial de
git, no solo en el diff.

## Entradas

### FD-001 — Distinguir transferencias reales de paradas simples

- **Estado:** adoptada
- **Origen:** recepción pública de agosto 2026, registrada como documento de
  entrada `Reddit reception evidence, August 2026` en el plan de épicas v1.0.
  No existe transcripción literal en el repositorio, así que esta entrada cita
  la procedencia y no palabras concretas de nadie.
- **Razón:** la agrupación de paradas por proximidad ya es un dato derivado del
  dominio, no una invención: `TransitTransferCandidate` y
  `TransitNetwork.transferCandidates`
  (`packages/core/src/types/transit-network.ts:211-301`) existen y se calculan
  desde paradas reales de `.cslmap`.
- **Necesidad:** quien planifica tránsito necesita ver dónde se transborda de
  verdad en vez de deducirlo de un racimo de marcadores idénticos.
- **Dato:** `TransitNetwork.transferCandidates`
  (`packages/core/src/types/transit-network.ts:211-301`), derivado de las
  paradas que el parser sí extrae en
  `packages/parser-cslmap/src/parser/handlers/transit.rs`.
- **Prueba:** `packages/core/src/transit-network/transit-network.test.ts` sobre
  `packages/parser-cslmap/fixtures/altavento.cslmap`, que trae cuatro conjuntos
  de paradas de tránsito reales.

### FD-002 — Leer la jerarquía vial de un vistazo

- **Estado:** adoptada
- **Origen:** recepción pública de agosto 2026 (ver FD-001 para la procedencia).
- **Razón:** la jerarquía no hay que inferirla ni inventarla: `itemClass` es la
  fuente de verdad y ya está mapeada a niveles en `ITEM_CLASS_TIER`
  (`packages/core/src/road-classification.ts:92`).
- **Necesidad:** quien lee el mapa necesita separar autopista, arteria y calle
  local sin medir anchos a ojo.
- **Dato:** `RoadSegment.item_class` y `RoadSegment.width`
  (`packages/parser-cslmap/src/city_data.rs`), resueltos a nivel por
  `ITEM_CLASS_TIER` (`packages/core/src/road-classification.ts:92`).
- **Prueba:** `packages/core/src/road-classification.test.ts` y el fixture
  `packages/parser-cslmap/fixtures/altavento.cslmap`, que contiene `Highway`,
  `Gravel Road` y el resto de clases en volumen real.

### FD-003 — Dibujar árboles individuales

- **Estado:** bloqueada por datos
- **Origen:** recepción pública de agosto 2026 (ver FD-001 para la procedencia).
- **Razón:** `.cslmap` no exporta entidades de árbol ni polígonos de vegetación.
  `parse_forest_csv`
  (`packages/parser-cslmap/src/parser/terrain/grid.rs:56`) lee una grilla de
  512 × 512 celdas de densidad (≈33.75 unidades de mundo por celda), y
  `ForestCell` (`packages/parser-cslmap/src/city_data.rs`) guarda exactamente
  `x`, `z` y `density`. Dibujar árboles sueltos sería inventar posiciones que el
  archivo no contiene.
- **Destino:** Vellum Bridge / spike CS1 (Epic 5, Story 5.1), donde el
  inventario por dominio incluye explícitamente la vegetación. El overlay de
  densidad actual se mantiene como la representación honesta de lo que hoy
  existe.

### FD-004 — Marcar edificios ploppables RICO

- **Estado:** bloqueada por datos
- **Origen:** recepción pública de agosto 2026 (ver FD-001 para la procedencia).
- **Razón:** no hay marcador de ploppable RICO en ninguna capa. `Building`
  (`packages/parser-cslmap/src/city_data.rs`) copia `subsrv` tal cual, y la
  unión `BuildingServiceType`
  (`packages/core/src/types/city-data.ts:203`) enumera los valores observados en
  exports reales sin ninguna variante que distinga un edificio ploppado de uno
  crecido. Un edificio RICO llega indistinguible de su equivalente por zonificación.
- **Destino:** Vellum Bridge / spike CS1 (Epic 5, Story 5.1). Si la API del
  juego expone el origen del edificio, la evidencia queda ligada a un fixture y
  esta entrada queda reemplazada; si no, se cierra como descartada.

### FD-005 — Nombres de calles en el mapa

- **Estado:** bloqueada por datos
- **Origen:** recepción pública de agosto 2026 (ver FD-001 para la procedencia).
- **Razón:** `<Seg>` no transporta ningún nombre. `RoadBuilder::handle_start`
  (`packages/parser-cslmap/src/parser/handlers/roads.rs:212-235`) lee exactamente
  `id`, `sn`, `en`, `icls` y `width`, y `RoadSegment`
  (`packages/parser-cslmap/src/city_data.rs`) no tiene campo de nombre. Los
  nombres de línea de tránsito sí son reales; los de calle no existen en el
  formato.
- **Destino:** Vellum Bridge / spike CS1 (Epic 5, Story 5.1), cuyo inventario
  cubre nombres además de geometría. Hasta entonces el mapa no rotula calles: un
  rótulo derivado del `id` del segmento sería una etiqueta falsa.

### FD-006 — Dar al mapa la apariencia nativa de cada plataforma

- **Estado:** descartada
- **Origen:** recepción pública de agosto 2026 (ver FD-001 para la procedencia).
- **Razón:** la plataforma decide el shell, nunca la salida cartográfica. Ese
  límite es un contrato con guardrail propio en
  `packages/ui/src/shell/platform-parity.test.ts`, y romperlo haría que el mismo
  `.cslmap` con el mismo `.vellumstyle` exportara imágenes distintas en Windows,
  macOS y Linux. La adaptación de plataforma que sí se quería —ventana, tokens
  de shell, instaladores— ya está cubierta por Epic 1 y no necesita tocar el
  mapa.
