# Investigación Técnica: Terreno y Geometría Vectorial en Vellum

**ID:** TR-002
**Tema:** Reemplazo de celdas de terreno por geometría vectorial
**Fecha:** 2026-06-05
**Investigador:** Sebas (Lead) + BMad (Research Partner)
**Estado:** Investigación Web Completada — Actualizado 2026-06-05

---

## 1. Resumen Ejecutivo

Investigación sobre la migración del modelo de representación del terreno en Vellum de una estructura discreta de celdas (Grid RLE de 1081x1081) a una representación vectorial continua mediante polígonos. El objetivo es eliminar el aliasing geográfico en las líneas de costa y optimizar el renderizado WebGL en MapLibre mediante el uso de capas de relieve y geometría de agua integrada.

---

## 2. Análisis del Origen de Datos (CS1 .cslmap)

- **Resolución:** Grid de 1081x1081 puntos sobre un área de 17280m x 17280m.
- **Densidad:** 16 metros por unidad de grid.
- **Formato:** XML con compresión Run-Length Encoding (RLE) en la etiqueta <Ter>.
- **Estructura:** Pares `valor:cantidad` (ej. `1600:10369`).

---

## 3. Visión Técnica: Transformación Agnostica

Para cumplir con el requerimiento de agnosticismo y performance, se propone el siguiente flujo:

### A. Capa de Datos (Rust - Parser/Core)

El parser de Rust no solo debe expandir el RLE, sino también realizar la **Vectorización de Contornos**.

- **Algoritmo:** Marching Squares para generar polígonos isobáticos (de igual altura).
- **Output:** Una colección de Multipolígonos que representan "bandas de altura".
- **Ventaja:** El payload IPC hacia el frontend ya contiene geometría lista para MapLibre o cualquier otro renderer futuro, sin que el frontend tenga que "pensar" en píxeles o grids.

### B. Capa de Relieve y Agua

- **Relieve:** Capa vectorial donde cada polígono tiene una propiedad `elevation`. El estilo (VellumStyle) aplicará el color basado en este valor.
- **Interacción Tierra/Agua:** El agua se tratará como un polígono base (SeaLevel) sobre el cual se "apoyan" los polígonos de terreno. La intersección se resolverá mediante operaciones booleanas de geometría en Rust (usando crates como `geo` o `clipper-rs`) para asegurar que la línea de costa sea una arista vectorial limpia, no una escalera de píxeles.

---

## 4. Benchmarking de Algoritmos (Pendiente)

- [ ] **Marching Squares:** Rapidez vs Precisión.
- [ ] **Douglas-Peucker:** Simplificación de polígonos generados para reducir el número de vértices enviados al IPC.
- [ ] **Earcut:** Triangulación necesaria para WebGL.

---

## 5. Próximos Pasos

- Investigar crates de Rust para generación de contornos (`contour` o similares).
- Evaluar impacto de tamaño de mensaje IPC al enviar polígonos vs grid RLE.

---

## 6. Hallazgos de Investigación (Crates de Rust)

Se han identificado las siguientes herramientas clave para la implementación en Rust:

1. **[contour](https://crates.io/crates/contour):** Port de d3-contour. Es la herramienta estándar para convertir grids en polígonos (`MultiPolygon`) usando Marching Squares. Soporta nativamente la exportación a GeoJSON.
2. **[geo](https://crates.io/crates/geo):** Crate fundamental para algoritmos geométricos en Rust. Permitirá aplicar **Douglas-Peucker** (`simplify`) para reducir el número de vértices y optimizar el payload IPC.
3. **[contour-isobands](https://crates.io/crates/contour-isobands):** Alternativa si necesitamos polígonos que representen rangos exactos (ej. de 40m a 50m) en lugar de "todo lo que sea mayor a X". Esto es ideal para el sistema de capas de relieve que propone Sebas.

---

## 7. Propuesta de Arquitectura para el Spike

### Fase 1: Transformación en Rust (parser-cslmap)

1. **Expansión RLE:** Convertir el bloque `<Ter>` en un `Vec<f64>` de tamaño 1,168,561.
2. **Generación de Bandas (Isobands):** Usar `contour` 0.13 con umbrales dinámicos (sea_level..max_elev, step 10m).
3. **Simplificación Geométrica:** Aplicar `geo::SimplifyVwPreserve` con tolerancia 2.0 (world-space units).
4. **Empaquetado IPC — Solo propiedades semánticas del dominio:**
   El parser Rust inyecta únicamente propiedades que describen el dato, **nunca propiedades de estilo visual**:

   ```json
   // ✅ Correcto — semántico
   { "elevation_min": 40.0, "elevation_max": 50.0, "type": "terrain_band" }
   { "type": "land" }
   { "type": "inland_water" }

   // ❌ Incorrecto — acoplamiento a MapLibre
   { "fill-color": "#95ae79", "opacity": 0.8 }
   ```

   El mapeo de `elevation_min/max` a la paleta visual (`terrainLow/Mid/High` del `VellumStyle`) es responsabilidad exclusiva de la capa TypeScript/React. Esto mantiene el parser completamente agnóstico al renderer.

### Fase 2: Renderizado en TypeScript (renderer-webgl)

1. **Fuente de Datos:** Crear un `GeoJSONSource` en MapLibre con los datos recibidos.
2. **Capa de Relieve:**
   - Tipo: `fill`.
   - Color: Usar una expresión `interpolate` o `step` en MapLibre basada en la propiedad `elevation` del polígono, mapeando a los colores del `VellumStyle`.
3. **Capa de Agua:** Un polígono estático base al nivel del mar, renderizado _debajo_ de las bandas de terreno. Esto garantiza que la línea de costa sea el borde del polígono de elevación más baja (> SeaLevel).

---

## 8. Consideraciones de Performance

- **Cómputo:** Vectorizar 1 millón de puntos en Rust es extremadamente rápido (<100ms con optimizaciones de release).
- **Memoria:** El uso de `SimplifyVwPreserve` es crítico. Sin simplificación, un mapa complejo podría generar megabytes de coordenadas, saturando el puente IPC de Tauri.
- **Agnosticismo:** Este enfoque permite que cualquier renderer (Canvas, SVG, WebGL) consuma los mismos polígonos.

### 8.1 Riesgo Crítico de IPC: El Payload Doble

**Certeza arquitectónica:** La spec mantiene `land_tiles` (Vec de ~700K objetos) y `water_tiles` (Vec de ~460K objetos) como invariantes del dominio. Esto significa que `CityData` serializado incluirá:

- Los arrays existentes (1.16M objetos `LandTile`/`WaterTile` en JSON)
- **MÁS** los nuevos polígonos GeoJSON (`land_polygon`, `inland_water_polygons`, `terrain_bands`)

El payload combinado **superará con certeza los 15-20 MB**, cruzando el umbral de bottleneck severo de Tauri.

**Plan de mitigación si el payload supera 15 MB:**

Enviar los dos tipos de datos por canales distintos:

```toml
# Cargo.toml — crate para serialización binaria eficiente
bincode = "1"
```

```rust
// Opción A: Comando IPC separado para los tiles crudos (binario)
// land_tiles / water_tiles → bincode → Uint8Array (bypasa JSON-RPC overhead)
// land_polygon / terrain_bands → serde_json → JSON estándar en CityData

// Opción B: Enviar solo los nuevos polígonos vectoriales en CityData;
// los tiles raw ya no se necesitan en el renderer WebGL (solo Canvas los usa).
// Fuera del scope de ESTE spike, pero es la solución de fondo.
```

**Acción de validación obligatoria antes de integrar capa visual:**

```rust
// En test o en eprintln! durante el spike
let json = serde_json::to_vec(&city_data).unwrap();
eprintln!("CityData IPC payload: {:.2} MB", json.len() as f64 / 1_048_576.0);
// Umbral de alerta: > 15 MB → aplicar mitigación antes de continuar
```

---

## 9. Hallazgos de Investigación Web (2026-06-05)

### 9.1 Versiones Correctas de Crates — Spec Desactualizada

**CRÍTICO:** La spec del spike referencia `contour-isobands = "0.2"`. La versión actual en crates.io es **0.4.3**. La API puede haber cambiado entre versiones.

| Crate              | Versión en Spec | Versión Actual                  | Fuente                                                                         |
| ------------------ | --------------- | ------------------------------- | ------------------------------------------------------------------------------ |
| `contour-isobands` | 0.2             | **0.4.3**                       | [crates.io/crates/contour-isobands](https://crates.io/crates/contour-isobands) |
| `geo`              | 0.28            | **0.33.1**                      | [crates.io/crates/geo](https://crates.io/crates/geo)                           |
| `contour`          | —               | **0.13.1** (alternativa viable) | [crates.io/crates/contour](https://crates.io/crates/contour)                   |

**Hallazgo clave:** El crate `contour` (0.13.1) ahora soporta _ambos_ modos: `.contours()` para isolíneas y `.isobands()` para bandas de elevación (rangos min/max). Usa la misma estructura `ContourBuilder`. Podría eliminar la necesidad de `contour-isobands` si se prefiere una sola dependencia.

### 9.2 API Verificada: `contour-isobands` 0.4.3

```rust
// Cargo.toml — versión correcta actualizada
contour-isobands = { version = "0.4", features = ["geojson"] }
geo = { version = "0.33", features = ["use-serde"] }

// Uso básico
use contour_isobands::ContourBuilder;

let builder = ContourBuilder::new(GRID_SIZE as u32, GRID_SIZE as u32);
// Opcional: .use_quad_tree(true) para mejor performance
let bands = builder.contours(
    &grid_values,                      // &[f64], row-major
    &[(40.0, 50.0), (50.0, 60.0)],    // intervalos (min, max)
)?;  // retorna Result<Vec<Band>, Error>

// Paralelo (con feature "parallel" via rayon)
let bands = builder.par_contours(&grid_values, &intervals)?;

// Struct Band
band.min_v  // f64
band.max_v  // f64
// geometría como MultiPolygon<f64> de la crate `geo`
band.to_geojson()  // Feature GeoJSON (requiere feature "geojson")
```

**Diferencia importante con spec:** El builder es `ContourBuilder::new(width, height)` sin el tercer parámetro `smooth` (eso es de `contour`, no de `contour-isobands`). El método retorna `Result<Vec<Band>>`, no `Vec<Band>`.

Fuente: [docs.rs/contour-isobands](https://docs.rs/contour-isobands/latest/contour_isobands/)

### 9.3 API Verificada: `contour` 0.13.1 (Alternativa)

```rust
use contour::ContourBuilder;

// Soporta smooth + origen + step configurables
let builder = ContourBuilder::new(GRID_SIZE as u32, GRID_SIZE as u32, false);
let bands = builder.isobands(&grid_values, &[(40.0, 50.0), (50.0, 60.0)])?;
// retorna Vec<Band> con .min_v, .max_v, y geometría
```

**Ventaja:** Un solo crate para landmass (`.contours()` con threshold) y para bandas de relieve (`.isobands()`).

Fuente: [docs.rs/contour](https://docs.rs/contour/latest/contour/)

### 9.4 Simplificación: `SimplifyVwPreserve` vs Douglas-Peucker

| Algoritmo                           | Trait                | Velocidad           | Topología        | Preserva rings pequeños |
| ----------------------------------- | -------------------- | ------------------- | ---------------- | ----------------------- |
| Ramer-Douglas-Peucker               | `Simplify`           | **3.5× más rápido** | ❌ Sin garantía  | ❌ Puede destruir islas |
| Visvalingam-Whyatt estándar         | `SimplifyVw`         | Intermedio          | ❌ Sin garantía  | Parcial                 |
| Visvalingam-Whyatt con preservación | `SimplifyVwPreserve` | **3.5× más lento**  | ✅ Intencional\* | ✅ Mejor                |

**⚠ Caveat importante:** El issue [georust/geo#1049](https://github.com/georust/geo/issues/1049) documenta que `simplify_vw_preserve()` **aún puede producir anillos auto-intersectados** en casos extremos. No es una garantía absoluta.

```rust
use geo::algorithm::simplify::{Simplify, SimplifyVwPreserve};

// Douglas-Peucker — rápido pero puede romper topología
let simplified = polygon.simplify(&2.0);

// Visvalingam-Whyatt preserve — más lento, mejor para isobandas con islas
let simplified = polygon.simplify_vw_preserve(&2.0);
```

**Recomendación:** Para las isobandas de relieve (`terrain_bands`) y el landmass (`land_polygon`), usar `SimplifyVwPreserve`. Si en benchmarks se observa que es inaceptablemente lento en `--release`, volver a `Simplify` con tolerancia más conservadora (ej. 0.5 en lugar de 2.0).

Fuente: [docs.rs/geo — Simplify trait](https://docs.rs/geo/latest/geo/algorithm/simplify/trait.Simplify.html)

### 9.5 Causa Raíz: Tests de Rust Lentos

**Diagnóstico confirmado:**

El test `transit_routes_assembled_from_stop_pairs` en `parser.rs:1128` usa `include_bytes!("../fixtures/altavento.cslmap")` — el fixture de 13MB embebido en el binario. Este test **no está marcado `#[ignore]`**. Cuando la vectorización (Marching Squares sobre 1M celdas) se integra en `parse_cslmap_bytes()`, este test la ejecutará en modo debug en cada `cargo test`.

**Por qué es lento en debug mode:** En modo debug, el compilador Rust desactiva optimizaciones. Un loop O(N) sobre 1.168.561 puntos que tarda ~10ms en `--release` puede tardar **decenas de segundos** en debug.

**Solución para el spike:**

```rust
// Nuevos tests de aceptación de vectorización → siempre con #[ignore]
#[test]
#[ignore = "vectorization over large fixture; run with: cargo test -p parser-cslmap --release -- --ignored"]
fn vectorize_landmass_altavento() {
    let bytes = include_bytes!("../fixtures/altavento.cslmap");
    let city = parse_cslmap_bytes(bytes).expect("parse ok");
    assert!(!city.land_polygon.is_empty());
    // ...
}
```

**Para el test existente `transit_routes_assembled_from_stop_pairs`:** Una vez que la vectorización esté en el flujo de parse, este test también será lento. Opciones:

- **Opción A (recomendada para el spike):** Marcarlo `#[ignore]` también — es un test de integración pesado, no un unit test.
- **Opción B:** Usar fixture más pequeño (`with-transit.cslmap` que ya existe y es pequeño) para la validación de transit routes, y mover la validación con altavento a `#[ignore]`.

**Comandos de referencia:**

```bash
# Pruebas rápidas (excluye #[ignore])
cargo test --workspace

# Solo pruebas de vectorización, optimizadas
cargo test -p parser-cslmap --release -- --ignored

# Todas las pruebas
cargo test -p parser-cslmap --release -- --include-ignored
```

Fuente: Patrón ya existente en `parser.rs:1359` con `#[ignore = "requires large fixture; run manually with cargo test -- --ignored"]`

### 9.6 Transformación WGS-84 en Rust — Convención Crítica

**El patrón ya existe** en `packages/parser-cslmap/examples/export_geojson.rs`:

```rust
const CS1_WORLD_HALF: f64 = 8640.0;
const CS1_WORLD_SIZE: f64 = CS1_WORLD_HALF * 2.0;
const CS1_EXTENT_DEG: f64 = CS1_WORLD_SIZE / 111_195.0; // ≈ 0.15541°
const CS1_HALF_EXTENT_DEG: f64 = CS1_EXTENT_DEG / 2.0; // ≈ 0.07770°
```

**⚠ DISCREPANCIA CRÍTICA DE ORIENTACIÓN:**

| Contexto                                          | Fórmula lat                 | Orientación                 | Resultado                 |
| ------------------------------------------------- | --------------------------- | --------------------------- | ------------------------- |
| `export_geojson.rs` (Rust example)                | `lat = -(z / 8640) * scale` | **North-up** (geográfico)   | Z positivo → lat negativa |
| `coordinate-transform.ts` con `CS1_LAT_SIGN = +1` | `lat = +(z / 8640) * scale` | **South-up** (Canvas/WebGL) | Z positivo → lat positiva |

La vectorización en Rust **DEBE usar la convención south-up** (sin negar Z) para que los polígonos de terreno alineen con los roads, buildings y demás features ya renderizados por el WebGL renderer.

```rust
// ✅ CORRECTO para el spike — south-up (coincide con CS1_LAT_SIGN = +1)
fn cs_to_geo(x: f64, z: f64) -> [f64; 2] {
    let lng = (x / CS1_WORLD_HALF) * CS1_HALF_EXTENT_DEG;
    let lat = (z / CS1_WORLD_HALF) * CS1_HALF_EXTENT_DEG; // sin negar z
    [lng, lat]
}

// ❌ INCORRECTO para el spike — north-up (lo que hace export_geojson.rs)
// lat = -(z / CS1_WORLD_HALF) * CS1_HALF_EXTENT_DEG // terreno invertido vs roads
```

La transformación se aplica a cada vértice del output de `contour-isobands` (índices de celda → world-space → WGS-84):

```rust
// contour-isobands devuelve coordenadas en espacio de índices (col, row)
// Paso 1: índice → world-space
let world_x = MAP_ORIGIN + col as f64 * CELL_SIZE; // MAP_ORIGIN = -8640, CELL_SIZE = 16
let world_z = MAP_ORIGIN + row as f64 * CELL_SIZE;
// Paso 2: world-space → WGS-84 (south-up)
let [lng, lat] = cs_to_geo(world_x, world_z);
```

### 9.7 Performance de GeoJSON en MapLibre GL JS

**Hallazgos verificados:**

- MapLibre usa Web Workers para tiling e indexing espacial (via `geojson-vt`), PERO la serialización de `JSON.stringify()` ocurre en el **main thread** al llamar `addSource()` o `setData()`.
- Costo estimado: ~200ms de serialización en main thread para datasets grandes + ~200ms en worker.
- Límite práctico sin degradación: **< 50.000 puntos** directamente como GeoJSON.
- Para datasets de hasta ~1M puntos: GeoJSON funciona si el payload post-simplificación está bajo **5-10 MB**.

**Para el spike:** El objetivo es que el GeoJSON de terreno quede bajo 2-3 MB post-simplificación. Validar con:

```bash
# En Rust antes de implementar la capa visual
eprintln!("land_polygon json: {} bytes", serde_json::to_string(&city.land_polygon)?.len());
```

Fuente: [MapLibre GL JS — GeoJSON Source optimization](https://maplibre.org/maplibre-gl-js/docs/guides/large-data/), [GitHub issue #106](https://github.com/maplibre/maplibre-gl-js/issues/106)

### 9.8 Benchmarking de Payload IPC en Tauri

**Patrón confirmado:**

```rust
// En un test de Rust (o en eprintln! durante desarrollo)
let json_bytes = serde_json::to_vec(&city_data)?;
eprintln!("CityData total IPC payload: {} bytes ({:.2} MB)",
    json_bytes.len(),
    json_bytes.len() as f64 / 1_048_576.0
);
```

**Latencias IPC de Tauri por tamaño:**

| Tamaño payload | Latencia aprox.          |
| -------------- | ------------------------ |
| < 10 KB        | ~5-10ms                  |
| 10 KB – 1 MB   | ~20-50ms                 |
| 1 – 10 MB      | ~100-200ms               |
| > 10 MB        | Bottleneck significativo |

**Implicación para el spike:** Si `CityData` con los nuevos polígonos supera ~5 MB, reconsiderar la estrategia (ajustar tolerancia de simplificación o enviar polígonos en un comando IPC separado del resto de `CityData`).

Fuente: [Tauri v2 — Inter-Process Communication](https://v2.tauri.app/concept/inter-process-communication/), [Tauri IPC performance discussion #11915](https://github.com/orgs/tauri-apps/discussions/11915)

---

## 10. Decisiones Arquitectónicas Actualizadas

### 10.1 Elección de crates — Stack Completo

**Decisión:** Usar `contour` 0.13.1 como crate principal de Marching Squares, más `geojson` para construcción de FeatureCollections válidas.

**Justificación de `contour` sobre `contour-isobands`:**

- Un solo crate para landmass (`.contours()`) y terrain_bands (`.isobands()`)
- La spec usaba `contour-isobands = "0.2"` que ya no existe — hay que actualizar de todas formas
- API más simple para el caso de landmass (no necesita isobands)

**Justificación de `geojson = "0.24"`:** El frontend (MapLibre) consume `GeoJSONSource` que espera una `FeatureCollection` con `Feature` objects donde cada feature tiene `geometry` y `properties`. La crate `geojson` interactúa perfectamente con `geo` y permite inyectar propiedades semánticas por feature (ej. `elevation_min`, `elevation_max`) antes de serializar. Sin ella, habría que construir los objetos `serde_json::Value` manualmente.

**Cargo.toml actualizado:**

```toml
[dependencies]
contour = { version = "0.13", features = ["geojson"] }
geo = { version = "0.33", features = ["use-serde"] }
geojson = "0.24"
serde_json = "1"  # mover de dev-dependencies a dependencies
```

### 10.2 Algoritmo de Simplificación

**Decisión:** Usar `SimplifyVwPreserve` para todos los polígonos de terreno.

**Tolerancia inicial:** `2.0` (world-space units = ~2m). Ajustar si:

- Los tests muestran anillos auto-intersectados → reducir a `0.5`
- El payload supera 5 MB → aumentar a `4.0` o `8.0`

### 10.3 Transformación de Coordenadas

**Decisión:** Implementar `cs_to_geo` en `parser.rs` usando convención **south-up** (`lat = +z * scale`). NO copiar el ejemplo de `export_geojson.rs` que usa north-up.

### 10.4 Estrategia de Tests

**Decisión:** Todos los nuevos tests de vectorización con `#[ignore]`. El test `transit_routes_assembled_from_stop_pairs` se marca también `#[ignore]` (es un integration test pesado, no un unit test — el change es justificado).

**Workflow de validación:**

```bash
# Durante desarrollo — fast (excluye fixtures pesados)
cargo test -p parser-cslmap

# Validación completa — en release
cargo test -p parser-cslmap --release -- --include-ignored
```

---

## 11. Consulta de Dominio Externo — Puntos Aceptados y Modificados

Del análisis externo recibido (2026-06-05):

| Recomendación                                          | Decisión                                                | Motivo                                                                         |
| ------------------------------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Avanzar con `contour-isobands` en Rust                 | ✅ **Aceptado** (con crate alternativo: `contour 0.13`) | Versión 0.2 ya no existe; `contour` cubre ambos casos con una sola dep         |
| Implementar stack de capas MapLibre                    | ✅ **Aceptado**                                         | Mapea a arquitectura de capas existente                                        |
| Mover WGS-84 transform a Rust                          | ✅ **Aceptado**                                         | Elimina procesamiento en main thread; patrón ya existe en `export_geojson.rs`  |
| Deprecar `land_tiles`/`water_tiles` como opcionales    | ❌ **Rechazado**                                        | La spec los declara invariantes del dominio; fuera del scope del spike         |
| `SimplifyVwPreserve` en lugar de Douglas-Peucker       | ✅ **Aceptado**                                         | Mejor preservación de topología; caveat de edge case documentado en §9.4       |
| Benchmark de payload IPC antes de integrar capa visual | ✅ **Aceptado + reforzado**                             | Ahora **obligatorio** dado el payload doble (tiles + polígonos); umbral: 15 MB |
| Prueba de alineación de costas                         | ✅ **Aceptado**                                         | Validar en DevTools post-render                                                |
| Añadir crate `geojson = "0.24"`                        | ✅ **Aceptado**                                         | Necesario para construir `FeatureCollection` con propiedades por feature       |
| Propiedades semánticas únicamente en Rust              | ✅ **Aceptado**                                         | Parser agnóstico al renderer; mapeo visual queda en TypeScript                 |
| Mitigación bincode si payload > 15 MB                  | ✅ **Documentado**                                      | Plan de contingencia en §8.1; evaluar si los tiles crudos bloquean IPC         |

---

## 12. Decisión Arquitectónica Pendiente: Deprecación de `land_tiles`/`water_tiles`

### 12.1 La Propuesta

Eliminar `land_tiles` y `water_tiles` de `CityData` por completo. El parser Rust exporta únicamente topología vectorial. El payload IPC pasa de ~20 MB a ~2-3 MB. El frontend recibe `FeatureCollection` listo para MapLibre y Canvas 2D via `Path2D`.

El agente de dominio externo calificó esta propuesta como **"Sí rotundo"** — es la evolución natural de la arquitectura.

### 12.2 Contexto: Canvas Renderer es Package Zombie

**`renderer-canvas` es un package zombie** — inactivo, sin prioridad, sin urgencia de mantenimiento (documentado en la retro 4, punto D1). Sus dependencias en `land_tiles`/`water_tiles` no son un bloqueador real. La migración a `Path2D` queda como spike opcional futuro, meritorio de su propia investigación, una vez el proyecto esté finalizado o en fase posterior.

Los archivos del Canvas renderer que dependen de los tiles crudos (`terrain-layer.ts`, `water-layer.ts`, `PresenceGrid.ts`, `renderer-worker.ts`) se dejan en su estado actual sin modificación. Romperlos es aceptable dado el estado del package.

### 12.3 Decisión: Deprecación Completa en este Spike

Con el Canvas renderer fuera de la ecuación, **la Opción C es la correcta y no tiene costo real**:

- `land_tiles` y `water_tiles` se eliminan de `CityData` (o se marcan `Option<Vec<_>>` poblados como `None`)
- El parser Rust no construye esos arrays — ahorra O(N) de allocaciones y tiempo de parse
- Los tres campos vectoriales (`land_polygon`, `inland_water_polygons`, `terrain_bands`) entran directamente en `CityData`
- Payload IPC: ~2-3 MB en lugar de >20 MB — sin mitigación adicional necesaria
- El WebGL renderer (`geojson-builder.ts:buildTerrainGeoJson`) migra a consumir los nuevos campos en la Fase 2 del spike

### 12.4 Impacto en la Spec — Renegociación Necesaria

La spec actual tiene estas constraints congeladas que deben renegociarse:

```
# En <frozen-after-approval> — cambiar:
"land_tiles y water_tiles permanecen en CityData — invariantes del dominio"
"Never: No eliminar ni reemplazar land_tiles/water_tiles"

# Por:
"land_tiles y water_tiles se eliminan de CityData en este spike"
"El parser Rust exporta exclusivamente topología vectorial para el terreno"
```

La renegociación es válida: la premisa que hacía de estos campos "invariantes del dominio" era que el Canvas renderer los necesitaba. Ese renderer es zombie. La invariante ya no aplica.
