# Investigación Técnica: Terreno y Geometría Vectorial en Vellum

**ID:** TR-002
**Tema:** Reemplazo de celdas de terreno por geometría vectorial
**Fecha:** 2026-06-05
**Actualizado:** 2026-06-06
**Investigador:** Sebas (Lead) + BMad (Research Partner)
**Estado:** **SPIKE COMPLETADO** — todos los hallazgos validados en implementación

---

## 1. Resumen Ejecutivo

Investigación y **spike completado** sobre la migración del modelo de representación del terreno en Vellum de una estructura discreta de celdas (Grid RLE de 1081x1081) a una representación vectorial continua mediante polígonos. El objetivo era eliminar el aliasing geográfico en las líneas de costa y optimizar el renderizado WebGL en MapLibre.

**Resultado:** ✅ Costas vectoriales orgánicas y suaves, payload IPC reducido de >20 MB a ~2-3 MB, carga <1s en dev. El spike se cierra con 10 commits, todos los acceptance criteria cumplidos.

---

## 2. Análisis del Origen de Datos (CS1 .cslmap)

- **Resolución:** Grid de 1081x1081 puntos sobre un área de 17280m x 17280m.
- **Densidad:** 16 metros por unidad de grid.
- **Formato:** XML con compresión Run-Length Encoding (RLE) en la etiqueta `<Ter>`.
- **Estructura:** Pares `valor:cantidad` (ej. `1600:10369`).
- **Dos valores por celda:** `elevation` (altura del terreno) y `resolution` (altura de la superficie de agua sobre esa celda).

---

## 3. Visión Técnica Implementada

### A. Capa de Datos (Rust — Parser/Core) ✅

El parser de Rust expande el RLE, acumula grids de elevación y resolución, y realiza la **Vectorización de Contornos** en la fase de build:

- **Algoritmo:** Marching Squares (dual crate: `contour-isobands 0.4` para polígonos, `contour 0.13.1` para isolíneas)
- **Output:** Cuatro campos vectoriales en `CityData`: `land_polygon`, `coastline`, `inland_water_polygons`, `contour_lines`
- **Payload IPC:** ~2-3 MB (vs >20 MB con tiles raw)
- **Simplificación:** Douglas-Peucker puro, tolerancia 1.0 world-space unit

### B. Capa de Renderizado (TypeScript — WebGL) ✅

- **Stack de capas MapLibre:** `base-water` + `base-land` (fill), `coastline-layer` (line), `terrain-lines-layer` (line)
- **Minimap:** `Path2D` con regla `evenodd` para huecos de agua interior

---

## 4. Benchmarking de Algoritmos — Resultados Finales

### ✅ Marching Squares — Validado

- `contour-isobands 0.4` usado para `land_polygon` e `inland_water_polygons` via `.contours()`
- `contour 0.13.1` usado para `contour_lines` via `.lines()`
- Rendimiento en release: ~91-182ms para grid completo de 1.16M celdas
- Ambos crates coexisten sin conflicto

### ✅ Douglas-Peucker — Validado (reemplazó a SimplifyVwPreserve)

- `SimplifyVwPreserve` descartado: O(N²) en costas complejas (>10 min congelamiento)
- Douglas-Peucker puro con tolerancia 1.0: O(N log N), visualmente indistinguible
- Reducción de payload ~10× sin pérdida de calidad visual

### ❌ Earcut — No necesario

- El spike se enfocó en la Fase 1 (Rust). MapLibre maneja la triangulación internamente.
- Earcut queda para trabajo futuro si se implementa un renderer Canvas/SVG propio.

---

## 5. Lecciones Aprendidas del Spike

### 5.1 Costas suaves: el secreto está en `res_grid` continuo

El hallazgo más importante del spike: **vectorizar sobre `res_grid` como campo continuo** (no un mask binario) produce costas orgánicas.

```rust
// Así NO — mask binario produce pixel-staircase
let mask = elev_grid.iter().map(|e| if *e <= sea_level { 0.0 } else { 1.0 }).collect();
let bands = builder.contours(&mask, &[0.5, 1.5]);

// Así SÍ — campo continuo, Marching Squares interpola entre celdas
let bands = builder.contours(res_grid, &[0.0, sea_level]);
```

Marching Squares interpola el campo continuo entre celdas vecinas, produciendo un borde curvo donde el campo cruza el threshold. Con un mask binario, el borde solo puede seguir los bordes de las celdas (efecto escalera).

### 5.2 Coastline: cero offset garantizado

La isolínea de costa se extrae de los mismos polígonos de `land_polygon`:

```rust
pub fn coastline_from_land_polygons(polygons: &[TerrainPolygon], sea_level: f64) -> TerrainIsoline {
    let lines = polygons.iter()
        .flat_map(|poly| {
            std::iter::once(poly.exterior.0.clone())
                .chain(poly.holes.iter().map(|h| h.0.clone()))
        })
        .filter(|l| l.len() > 1)
        .collect();
    TerrainIsoline { elevation: sea_level, lines }
}
```

Los vértices del trazo son **exactamente los mismos** que los del relleno. Zero geometric offset — en MapLibre no hay gap ni desalineación entre `base-land` (fill) y `coastline-layer` (line).

### 5.3 Refactorización del parser: de monolito a módulos

El parser `parser.rs` creció a más de **1600 líneas** durante la implementación del spike, mezclando event loop XML, builders de dominio, vectorización de terreno, handlers de roads/transit/buildings/districts, tipos y tests. Fue refactorizado en 9 módulos:

```
src/parser.rs                    # Event loop + observer (260 líneas)
src/parser/builder.rs            # CityDataBuilder con build phase (190)
src/parser/terrain/grid.rs       # Parseo de grids CSV (64)
src/parser/terrain/vectorizer.rs # Marching Squares + WGS-84 (208)
src/parser/terrain/texture.rs    # Textura PNG (101)
src/parser/handlers/             # handlers/* (roads, transit, buildings, districts)
src/parser/types.rs              # types/* (road, terrain, transit)
src/parser/utils.rs              # Utilidades compartidas
src/parser/events.rs             # Payloads IPC
src/parser/tests.rs              # Tests (327)
```

Beneficios observados:

- Compilación incremental: cambios en handlers de roads no recompilan terrain
- Cada módulo < 330 líneas (fácil de mantener)
- Separación clara entre parse (XML event loop) y build (vectorización + dominio)

### 5.4 `terrain_bands` → `contour_lines`

La propuesta original de `terrain_bands` (isobandas de elevación cada 10m) fue reemplazada por `contour_lines` (isolíneas de elevación específicas):

| Feature         | Enfoque                                  | Estado                                  |
| --------------- | ---------------------------------------- | --------------------------------------- |
| `terrain_bands` | Isobandas (polígonos) cada 10m           | Diferido — O(N × num_bands) muy costoso |
| `contour_lines` | Isolíneas (líneas) con paso configurable | ✅ Implementado                         |

### 5.5 Dual crate de Marching Squares

Se necesitaron **dos crates** de Marching Squares:

| Crate                  | Método                      | Uso                                                |
| ---------------------- | --------------------------- | -------------------------------------------------- |
| `contour-isobands 0.4` | `.contours(&[f64], &[f64])` | Polígonos: `land_polygon`, `inland_water_polygons` |
| `contour 0.13.1`       | `.lines(&[f64], &[f64])`    | Isolíneas: `contour_lines`                         |

`contour-isobands` retorna `geo::MultiPolygon<f64>`, ideal para fills. `contour` retorna `MultiLineString<f64>`, necesario para líneas estilizadas. La API difiere (constructor de `contour` requiere flag `smooth`), pero ambos coexisten sin problemas.

### 5.6 Crate `geojson` no fue necesario

El crate `geojson = "0.24"` se consideró pero **no se añadió**. Las coordenadas WGS-84 se construyen como `Vec<[f64; 2]>` y se serializan directamente con `serde`. La construcción de `FeatureCollection` ocurre en TypeScript (`geojson-builder.ts`), no en Rust.

---

## 6. Próximos Pasos (Post-Spike)

1. **VellumStyle integration** (Épica 5): Conectar tokens de estilo a `base-land`, `coastline-layer`, `terrain-lines-layer`
2. **compute_terrain_bands()** comando IPC separado para isobandas finas
3. **Terrain texture bake** opcional: elevación + contour lines baked en un solo PNG

---

## 7. Hallazgos de Investigación Validados vs Realidad de Implementación

| Hallazgo de Investigación           | Decisión en Spec          | Realidad de Implementación                                                                                  |
| ----------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Usar `contour-isobands 0.2`         | → `0.4.3`                 | ✅ `0.4` (correcto) — pero se añadió también `contour 0.13.1` para isolíneas                                |
| Usar `contour` para ambos modos     | Alternativa viable        | ✅ Ambos crates coexisten; no se pudo unificar porque `contour` retorna `MultiLineString` no `MultiPolygon` |
| `SimplifyVwPreserve` recomendado    | → Aceptado                | ❌ Descartado — O(N²) en costas complejas (>10 min). Reemplazado por DP puro                                |
| `geojson = "0.24"` necesario        | → Aceptado                | ❌ No añadido — `serde` es suficiente; FeatureCollection se construye en TS                                 |
| Migrar WGS-84 transform a Rust      | → Aceptado                | ✅ `world_to_wgs84()` implementado con south-up                                                             |
| Deprecar `land_tiles`/`water_tiles` | → Rechazado → Renegociado | ✅ Completamente eliminados de `CityData`                                                                   |
| Benchmark payload IPC               | → Obligatorio             | ✅ Payload ~2-3 MB, bajo el umbral de 15 MB                                                                 |
| Bincode como mitigación             | → Documentado             | ❌ No necesario — la eliminación de tiles crudos resolvió el problema                                       |
| Prueba de alineación de costas      | → Aceptado                | ✅ Verificado: coastline se extrae de land_polygon rings — cero offset                                      |

---

## 8. Stack Tecnológico Final

```toml
# packages/parser-cslmap/Cargo.toml — dependencias del spike
contour-isobands = "0.4"     # Marching Squares → geo::MultiPolygon<f64>
contour = "0.13.1"           # Marching Squares → lines (isolíneas)
geo = "0.33"                 # Simplify (Douglas-Peucker)
serde_json = "1"             # serialización interna
image = { version = "0.24", default-features = false, features = ["png"] }
base64 = "0.22"              # encoding PNG → data URL
```

```toml
# Cargo.toml (workspace) — perfiles críticos
[profile.dev.package.contour-isobands]
opt-level = 3
[profile.test.package.contour-isobands]
opt-level = 3
# mismo patrón para contour, geo, geo-types, quick-xml, parser-cslmap
```

> ⚠ El perfil `test` NO hereda overrides de `dev`. Ambos deben especificarse explícitamente.

---

## 9. Stack de Capas MapLibre (Final)

```
Layer ID            Type     Source       Description
─────────────────────────────────────────────────────
base-water          fill     base         Océano (kind=water)
base-land           fill     base         Masa terrestre (kind=land)
coastline-layer     line     coastline    Trazo estilizado de la costa
terrain-lines-layer line     terrain-lines Isolíneas de elevación
forests             fill     forests      Cobertura forestal
buildings           fill     buildings    Huellas de edificios
roads               line     roads        Segmentos de carretera
transit-lines       line     transit      Líneas de transporte público
transit-stops       circle   transit      Paradas de transporte
districts           symbol   districts    Etiquetas de distritos
```

---

## 10. Estructura del Código Post-Spike

```
packages/parser-cslmap/src/
├── lib.rs                         # Re-exporta módulos públicos
├── city_data.rs                   # Domain model (248 líneas)
├── errors.rs                      # VellumError enum
├── dlc_fallback.rs                # DLC asset resolution
├── types.rs                       # types/mod.rs → road, terrain, transit
├── parser.rs                      # Event loop XML + observer (260 líneas)
└── parser/
    ├── builder.rs                 # CityDataBuilder (190 líneas)
    ├── events.rs                  # Payloads IPC
    ├── handlers.rs                # Router de handlers
    ├── handlers/
    │   ├── buildings.rs
    │   ├── districts.rs
    │   ├── roads.rs
    │   └── transit.rs
    ├── terrain.rs                 # Re-exporta sub-módulos
    ├── terrain/
    │   ├── grid.rs                # Parseo CSV → grids (64 líneas)
    │   ├── vectorizer.rs          # Marching Squares + WGS-84 (208 líneas)
    │   └── texture.rs             # PNG bake (101 líneas)
    ├── types.rs                   # TextElement enum
    ├── utils.rs                   # rgba_to_hex, etc.
    └── tests.rs                   # Tests (327 líneas)
```

---

## 11. Glosario de Términos

| Término                 | Significado                                                           |
| ----------------------- | --------------------------------------------------------------------- |
| `elev_grid`             | Grid 1081×1081 de elevación del terreno (raw game units)              |
| `res_grid`              | Grid 1081×1081 de altura de superficie de agua (resolution)           |
| `sea_level`             | Umbral de elevación que separa océano de tierra (~187 para Altavento) |
| `land_polygon`          | `Vec<TerrainPolygon>` — masa terrestre con huecos para agua interior  |
| `coastline`             | `TerrainIsoline` — isolínea en `sea_level` extraída de land_polygon   |
| `inland_water_polygons` | `Vec<TerrainPolygon>` — ríos y lagos sobre tierra seca                |
| `contour_lines`         | `Vec<TerrainIsoline>` — isolíneas de elevación para capa de relieve   |
| `South-up`              | Convención donde Z positiva = latitud positiva (CS1_LAT_SIGN = +1)    |
| `SIMPLIFY_TOLERANCE`    | 32.0 world-space units. La tolerancia efectiva es 1.0 (32/32)         |
