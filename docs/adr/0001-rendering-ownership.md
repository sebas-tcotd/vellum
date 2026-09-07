# ADR-0001 — Ownership del rendering: puertos, adapters y composition root

- **Estado:** Aceptada
- **Fecha:** 2026-09-06
- **Commit base de la evidencia:** `a9e8892`
- **Story:** 1.3 — _Decidir el ownership de renderers mediante puertos y adapters_
- **Supersede:** nada (primer ADR del repositorio)

> **Convención.** Este es el primer ADR de Vellum e inaugura `docs/adr/`: un
> archivo por decisión, numeración de cuatro dígitos, nombre
> `NNNN-titulo-en-kebab-case.md`. Un ADR aceptado no se reescribe; se supersede
> con uno nuevo que lo referencie.

---

## Contexto

Vellum documentaba una frontera limpia entre presentación y tecnología de
renderizado, y no la tenía. `@vellum/core` declaraba `IRenderer` con un JSDoc que
prohibía explícitamente instanciar el adapter desde la UI, y `@vellum/ui` lo
incumplía en la línea 16 de `MapLibreRoot.tsx`. Al mismo tiempo el repositorio
arrastraba un segundo adapter, `@vellum/renderer-canvas`, que nadie importaba
pero que seguía compilándose, testeándose y linteándose en cada corrida de CI.

Esta decisión cubre tres preguntas que estaban abiertas a la vez:

1. ¿`renderer-canvas` se retira, se mantiene como fallback soportado, o se
   reactiva como adapter?
2. ¿Cuál es exactamente el puerto de rendering, qué adapters son admisibles y
   quién los ensambla?
3. ¿Cómo se impide que la frontera se vuelva a cruzar sin que nadie se entere?

### Evidencia

Todos los datos se verificaron sobre `a9e8892` antes de citarse aquí.

**E1 — `renderer-canvas` no tenía ni un importador de runtime.** Ningún `.ts` ni
`.tsx` del repositorio lo importaba. Las únicas referencias eran declarativas:
`packages/ui/package.json`, `apps/desktop/package.json`, el path alias de
`tsconfig.json`, el alias de test de `packages/ui/vitest.config.ts`, la entrada de
`vitest.workspace.ts`, las `references` de dos `tsconfig.json`, una regla
`no-restricted-imports`, un comentario en `renderer-webgl` y varios documentos.

**E2 — No estaba en el bundle de producción.** `apps/desktop/vite.config.ts` sólo
aliasea `@vellum/renderer-webgl`. Retirarlo **no reduce el tamaño del
instalador**; ese argumento sería falso y no se usa aquí.

**E3 — Sí costaba en CI y en mantenimiento.** 2 133 líneas de fuente en 19
archivos más 3 293 líneas de tests en 12 archivos, que `pnpm build`, `pnpm lint`
y `pnpm test` procesaban en cada corrida de `.github/workflows/ci.yml`. Arrastraba
`jsdom` como devDependency y `@fontsource/dm-mono` como dependencia de runtime.
El package tenía además `src/index.js` y `src/index.d.ts` comiteados, es decir
artefactos de build versionados.

**E4 — Divergencia de taxonomía: ya no era un fallback drop-in.**
`renderer-canvas/src/layers/roads-layer.ts` definía los tiers
`highway | railway | largeArterial | mediumArterial | local | gravel | pedestrian | pedestrianWay`
con sus propios anchos, mientras `renderer-webgl` usa
`highway | train | metro | largeArterial | mediumArterial | local | gravel | pedestrian | pedestrianWay`
con otros anchos y un `EXCLUDED_ROAD_CLASSES` que Canvas no tenía. Un mismo
`.cslmap` no producía la misma jerarquía vial en ambos.

**E5 — El propio código se declaraba muerto.** Tres módulos
(`layers/terrain-layer.ts`, `layers/water-layer.ts`, `geometry/PresenceGrid.ts`,
`worker/renderer-worker.ts`) abrían con el comentario _"renderer-canvas is a
zombie package — LandTile/WaterTile removed from `@vellum/core`"_: sus capas de
terreno y agua eran no-ops porque los tipos de dominio que consumían ya no
existían. No era un fallback dormido, era un adapter que ya no podía dibujar un
mapa completo.

**E6 — La frontera UI ↔ renderer estaba rota en puntos concretos.**
`MapLibreRoot.tsx:16` hacía `import { MapLibreRenderer } from '@vellum/renderer-webgl'`
y lo instanciaba con `new`. Además `@vellum/ui` importaba **valores** (no sólo
tipos) del adapter: `csToGeoArray` en `Minimap.tsx`, `serviceIconDataUri` en
`IconLegend.tsx`, `resolveFullMapOutputSurface` y `vellumLogoDataUri` en
`ExportDialog.tsx`. Y llamaba a `@tauri-apps/*` en siete sitios de producción.

**E7 — `pnpm check:architecture` no comprobaba la arquitectura.** Resolvía a
`eslint packages apps`, y las únicas reglas `no-restricted-imports` existentes
eran guardas contra **rutas internas** (`@vellum/core/src/*`, `**/ui/src/**`, el
alias `@/*`). No existía ninguna regla que impidiera a `core` importar otro
package, ni a `ui` importar el adapter concreto o Tauri. Por eso E6 nunca
disparó.

**E8 — La documentación afirmaba algo que el código no cumplía.**
`project-context.md` decía de `ui`: _"Depende de `IRenderer` (port), nunca de una
implementación concreta"_. E6 lo contradecía.

**E9 — Ya había precedente en el pipeline de exportación.** El spine
`architecture-export-pipeline-2026-07-27` decide en **AD-1** que `IRenderer` no
recibe métodos de exportación (`RasterExportPort`, `ExportSink`,
`ExportSnapshot` son contratos separados que sólo `apps/desktop` ensambla), en
**AD-5** que `MapLibreRoot` posee sólo el renderer interactivo, en **AD-4** que
la semántica cartográfica se reutiliza y _no se importa `renderer-canvas` como
solución_, y en **AD-16** que el adapter SVG consume un modelo cartográfico
neutral sin importar `renderer-webgl`. La disciplina existía para exportación y
no se había extendido al renderer interactivo.

---

## Opciones consideradas

### A. Retiro de `renderer-canvas` — **elegida**

Eliminar el package y todas sus referencias colgantes.

- **A favor:** cero importadores (E1), coste real y recurrente en CI (E3), un
  adapter que ya no puede dibujar terreno ni agua (E5), y una taxonomía vial
  divergente que hace de "fallback" una promesa incumplible (E4). El código
  sigue vivo en el historial de git y en su README, que es donde pertenece una
  referencia histórica.
- **En contra:** se pierde la única implementación alternativa de `IRenderer`,
  lo que quita una prueba viva de que el puerto es sustituible. Se mitiga con la
  regla de lint: la sustituibilidad pasa a estar garantizada por el guardrail,
  no por la existencia de un segundo adapter muerto.

### B. Fallback soportado

Mantenerlo y declarar un criterio de activación.

- **En contra:** hoy **no es drop-in**. Elegir esta opción obligaba a
  presupuestar la paridad de taxonomía vial (E4) _y_ a reimplementar terreno y
  agua sobre los tipos actuales de `CityData` (E5) antes de poder prometer nada.
  Es trabajo de una épica, no un checkbox, y nadie ha pedido la capacidad.

### C. Reactivarlo como adapter de primera clase

- **En contra:** el motivo original del pivot sigue vigente — el overscan
  buffer de CPU no escalaba con mapas grandes, que es exactamente el caso de uso
  de Vellum. Reactivarlo sería revertir una decisión de rendimiento ya validada.

---

## Decisión

### D1 — `renderer-canvas` se retira

`packages/renderer-canvas` se elimina del repositorio junto con sus nueve
referencias colgantes: las dependencias declaradas en `packages/ui/package.json`
y `apps/desktop/package.json`, el path alias de `tsconfig.json`, las
`references` de `packages/ui/tsconfig.json` y `apps/desktop/tsconfig.json`, el
alias de `packages/ui/vitest.config.ts`, el proyecto en `vitest.workspace.ts`, la
regla `no-restricted-imports` que lo mencionaba y la documentación que lo
describía como legacy vivo.

La desaparición de sus 3 293 líneas de test **no es pérdida de cobertura**: no
cubrían ninguna ruta que la aplicación ejecute.

### D2 — El puerto de rendering interactivo es `IRenderer`, y se mantiene estrecho

`IRenderer` (`packages/core/src/types/renderer.ts`) conserva sus cinco métodos:
`render`, `updateViewport`, `resize(width, height)`, `applyTheme`, `dispose`.
No recibe métodos de exportación: eso sería reabrir AD-1 (E9).

Sobre él se declaran **puertos segregados por preocupación** (ISP), en el mismo
módulo de `@vellum/core`:

| Puerto                 | Responsabilidad                                                                                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `MapCameraPort`        | Encuadre y navegación: `fitToScreen`, `zoomIn/Out`, `rotateBy`, `resetBearing`, `toggleNavigationMode`, `navigateTo`, `getBearing`, `getInitialViewportBounds`, `setViewportPadding` |
| `MapLayersPort`        | Composición de capas: `clear`, `setLayerVisibility`, `setLayerOptions`, `setTransitDimming`, `setWatermarkVisibility`                                                                |
| `MapSubscriptionsPort` | Observación del mapa vivo: `subscribeViewport`, `subscribeHover`, `subscribeServiceIconLegend`                                                                                       |
| `MapCapturePort`       | Capturas inmutables para el pipeline de export: `capturePreview`, `createExportSnapshot`, `createSvgExportSnapshot`                                                                  |
| `MapRendererPort`      | Composición de los cuatro más `IRenderer` — lo que consume el host del mapa                                                                                                          |
| `MapRendererFactory`   | `(container, style) => MapRendererPort` — lo único que la UI recibe sobre tecnología de render                                                                                       |

Un puerto único que enumerase los ~20 métodos públicos del adapter sería un
espejo de la implementación, no un contrato. La segregación existe para que un
consumidor futuro dependa sólo de la porción que usa.

**Los tipos de los puertos viven con los puertos.** `TooltipInfo`,
`ViewportBounds`, `ServiceIconLegendState` y su vocabulario asociado
(`TransitLineInfo`, `TransitTooltipInfo`, `DistrictTooltipInfo`) se mueven de
`renderer-webgl` a `packages/core/src/types/renderer.types.ts`. Un puerto no
puede declararse en `core` si su payload vive en el adapter. `renderer-webgl`
conserva su superficie pública reexportándolos.

### D3 — Adapters admisibles

`MapLibreRenderer` (`@vellum/renderer-webgl`) es el **único adapter de
producción**. Satisface `MapRendererPort` **estructuralmente**: no declara
`implements`, y su API pública no cambia. La razón es deliberada — el adapter
tiene una superficie propia más ancha que el puerto (`applyExportBackground`,
`setCamera`, `syncCanvasSize`, `captureSnapshotPng`…) que sólo el pipeline de
export usa desde `apps/desktop`; el puerto es lo que el dominio le pide, no un
inventario de lo que sabe hacer.

Un adapter alternativo es admisible sólo si:

1. satisface `MapRendererPort` estructuralmente;
2. no filtra su tecnología a `@vellum/core` ni a `@vellum/ui` — ni por import de
   valor, ni por import de tipo, ni por nombre en una prop;
3. alcanza paridad con la taxonomía vial canónica (ver D6), no con una propia.

**Criterio sobre `import type`.** Los imports de sólo tipo desde `@vellum/ui`
hacia el adapter **no se toleran**, aunque desaparezcan en runtime. Un tipo del
adapter en una firma de la UI es acoplamiento de compilación: obliga a que
cualquier renderer sustituto reproduzca la forma exacta de esos tipos. Por eso
se movieron a `core` en lugar de admitirse. La regla de lint no distingue
`import` de `import type`, que es exactamente lo que se quiere.

### D4 — `apps/desktop` es el único composition root

Sólo `apps/desktop` construye adapters concretos. En la práctica:

- `main.tsx` define `createRenderer: MapRendererFactory` a **module scope** y lo
  pasa a `<App>`; la identidad estable es un requisito, no un detalle — el
  efecto de montaje de `MapLibreRoot` depende de ella, y una factory creada
  inline en JSX reconstruiría el mapa en cada render.
- `apps/desktop/src/export/*` **sí** puede importar `@vellum/renderer-webgl`:
  ahí el composition root ensambla el pipeline de export por diseño (AD-1,
  AD-16). No es una excepción a esta ADR, es su aplicación.
- La prop `createRenderer` es **obligatoria** en `AppProps` y en
  `MapLibreRootProps`. Omitirla es un error de compilación en el composition
  root, no un mapa en blanco en runtime.

### D5 — El shell también es un adapter

`@vellum/ui` deja de importar `@tauri-apps/*`. Las capacidades del shell entran
por dos vías, según el consumidor:

- **`PlatformServices`** (`packages/ui/src/context/PlatformServicesContext.tsx`)
  para los componentes: `invoke`, `subscribeEvent`, `openExternalUrl`,
  `subscribeFileDrop`. Es un contrato genérico sobre `IPC_COMMANDS` /
  `IPC_EVENTS`, no un método por comando: los nombres ya son la constitución del
  proyecto en `@vellum/core`, duplicarlos aquí obligaría a tocar el puerto cada
  vez que se agrega un comando.
- **`setPreferencesPort`** (`packages/ui/src/store/preferences-store.ts`) por
  registro de módulo, porque sus consumidores (`vellum-store`, `i18n-setup`)
  corren fuera de React y no pueden leer un contexto.

Ambos tienen **default no-op que nunca lanza**: lecturas resuelven `undefined`,
escrituras y suscripciones no hacen nada. Es exactamente el fallback que el
`preferences-store` ya tenía cuando `preferences.json` fallaba al cargar
(NFR9), extendido al resto del shell.

**La política se queda en la UI.** El adapter de drop entrega rutas; el filtro
`.cslmap` y el guard de `loadingState === 'loading'` viven en `MapLibreRoot`.
Un adapter que decidiera qué archivo es interesante estaría tomando una decisión
de producto.

Las dependencias siguen al adapter: `@tauri-apps/api`, `@tauri-apps/plugin-opener`
y `@tauri-apps/plugin-store` se declaran ahora en `apps/desktop/package.json` y
no en `packages/ui/package.json`.

### D6 — Destino canónico de la semántica vial y de tránsito

Esta ADR **nombra** el destino. La mitad vial ya está migrada (Story 1.4); la
de tránsito sigue pendiente (Story 1.5) y está fuera de alcance aquí.

- **Vial — migrado (Story 1.4).** El conocimiento vive en
  `packages/core/src/road-classification.ts` (`ITEM_CLASS_TIER`,
  `EXCLUDED_ROAD_CLASSES`, `ROAD_WIDTH_STYLES`, `classifyRoadTier`,
  `classifyRoadCategory`, `RoadTier`, `RoadCategory`), exportado por el barrel
  de `@vellum/core`. El antiguo
  `packages/renderer-webgl/src/geojson/config/road-classification.ts`
  desapareció: sus consumidores —`geojson/builders/roads.builder.ts`,
  `layers/layer-roads.ts`, `expressions/road-color.ts`,
  `export/cartographic-scene-builder.ts`, `apps/desktop/src/export/svg/*` y el
  minimapa de `@vellum/ui`— derivan del módulo canónico en lugar de re-listar
  `ItemClass`. Es lógica pura sobre `ItemClass`, sin dependencia de MapLibre.
  La decisión de _categoría de red_ (`road` / `railway` / `ferry` / `airship` /
  `excluded`) es una proyección de las mismas tablas, no una enumeración
  paralela: `properties.category` del GeoJSON es la única entrada de los
  filtros de capa.
- **Tránsito.** `packages/renderer-webgl/src/transit/*` mezcla derivación de red
  (`line-graph`, `ordering`) con geometría de render (`render-geometry`). El
  corte es exactamente ése: **la proyección `TransitNetwork` pertenece a
  `@vellum/core`** (módulo `packages/core/src/types/transit-network.ts` más su
  derivación), y la geometría de render se queda en el adapter. **Story 1.5 lo
  implementa.**
- Invariantes de dominio que ninguna migración puede romper: no renderizar
  `icls="Bus Line"` como geometría vial; no unificar `LandArray` con
  `WaterArray`; exponer siempre `fixed` y `scaled` de ancho por separado, nunca
  un valor precalculado; nada de pathfinding de tránsito.

### D7 — El grafo de dependencias se enforcea en CI

`eslint.config.mjs` declara un scope `files:` por package con
`no-restricted-imports`. No se introdujo ningún plugin nuevo: el guardrail se
agota con la regla que ya estaba en uso.

| Scope                            | Prohibido                                                                  |
| -------------------------------- | -------------------------------------------------------------------------- |
| `packages/core/src/**`           | cualquier `@vellum/*`, `react`/`react-dom`, `maplibre-gl`, `@tauri-apps/*` |
| `packages/ui/src/**`             | `@tauri-apps/*`, `@vellum/renderer-webgl`, `maplibre-gl`                   |
| `packages/renderer-webgl/src/**` | `react`/`react-dom`, `@tauri-apps/*`, `@vellum/ui`                         |

`apps/desktop` queda deliberadamente sin scope: es el composition root.

Nota de implementación: ESLint flat config **reemplaza** las opciones de una
regla cuando un bloque posterior la redeclara. Las guardas de deep-import
(`@vellum/core/src/*`, el alias `@/*`, …) están extraídas a la constante
`deepImportPatterns` y se re-inyectan en cada scope, para que scopear un package
no le quite su guarda de barrel.

---

## Consecuencias

**Positivas**

- El grafo de dependencias declarado y el real coinciden por primera vez, y CI
  falla si divergen. Comprobado introduciendo una violación a propósito en
  `packages/core/src` y en `packages/ui/src` y revirtiéndola.
- `@vellum/ui` es sustituible de shell: nada en `packages/ui/src` nombra Tauri
  ni MapLibre. Un host web o un harness de tests obtiene defaults no-op sin
  tocar el árbol de componentes.
- CI deja de compilar, testear y lintear 5 426 líneas que no cubrían nada.
- Los símbolos puros que la UI necesitaba (`csToGeoArray`, `serviceIconDataUri`,
  `vellumLogoDataUri`, `resolveFullMapOutputSurface`) están donde corresponde —
  `@vellum/core` — y siguen accesibles desde `@vellum/renderer-webgl` vía
  reexport, así que ningún consumidor existente se rompe.

**Negativas y costes aceptados**

- **No hay un segundo adapter que pruebe la sustituibilidad.** El puerto se
  sostiene por revisión y por lint, no por una implementación paralela viva.
- `@vellum/core` gana peso: la transformación de coordenadas, el catálogo de
  iconos de servicio y el logo son datos, no tipos. Es un movimiento consciente —
  son puros, no arrastran `maplibre-gl`, y sin ellos `@vellum/ui` no podía
  dejar de importar el adapter.
- Tres módulos de `renderer-webgl` (`coordinate-transform.ts`,
  `service-icons.ts`, `assets/vellum-logo.ts`) y uno de tipos
  (`types/renderer.types.ts`) quedan como shims de reexport. Es deuda cosmética
  deliberada: eliminarlos exigiría reescribir ~25 imports relativos internos del
  adapter y cambiar su superficie pública, sin beneficio funcional.
- `MapRendererFactory` tipa su contenedor como `HTMLDivElement`, no como
  `HTMLElement`, para no ensanchar la firma pública de `MapLibreRenderer`. Es un
  compromiso menor a favor de no tocar el adapter.

## Prohibido a partir de ahora

1. Reintroducir `@vellum/renderer-canvas`, en cualquier forma.
2. Importar `@vellum/renderer-webgl`, `maplibre-gl` o `@tauri-apps/*` desde
   `packages/ui/src` — incluidos los `import type`.
3. Importar cualquier `@vellum/*`, `react`, `maplibre-gl` o `@tauri-apps/*`
   desde `packages/core/src`.
4. Instanciar un adapter concreto fuera de `apps/desktop`.
5. Añadir métodos de exportación a `IRenderer` (AD-1 sigue vigente).
6. Duplicar la clasificación vial o la derivación de `TransitNetwork` en un
   adapter nuevo en lugar de consumir el módulo canónico de D6.
7. Añadir un plugin de ESLint para expresar una regla de frontera antes de haber
   agotado `no-restricted-imports` con scopes por `files`.

`LegacyRasterExporter` **no** entra en ninguna de estas prohibiciones: es un
fallback vivo del pipeline de exportación y no tiene relación con
`renderer-canvas` más allá del nombre.

## Referencias

- `packages/core/src/types/renderer.ts` — `IRenderer` y los puertos segregados
- `packages/ui/src/context/PlatformServicesContext.tsx` — contrato del shell
- `packages/ui/src/store/preferences-store.ts` — `PreferencesPort`
- `apps/desktop/src/main.tsx` — el composition root ensamblando todo
- `eslint.config.mjs` — `dependencyDirectionScopes`
- Spine `architecture-export-pipeline-2026-07-27` — AD-1, AD-4, AD-5, AD-16
- Spine `architecture-vellum-2026-09-05` — AD-2, AD-8
