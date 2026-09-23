# El documento `.vellummap` (v1)

`.vellummap` es el documento de ciudad estable de Vellum: versionado, validable con JSON
Schema e independiente del programa que lo produce. Vellum Bridge lo exportará desde
Cities: Skylines 1 (Story 5.3) y Vellum Desktop lo abrirá (Story 5.4). `.cslmap` sigue
siendo la vía retrocompatible.

Esta página es el contrato. Describe lo que el lector de `parser-cslmap` acepta hoy: si
algo no está aquí, el documento no lo admite.

- Schema legible por máquinas (JSON Schema 2020-12):
  `packages/parser-cslmap/schema/vellummap.schema.json`. La raíz valida `manifest.json` y
  cada módulo JSON tiene su `$defs` con el mismo nombre (`#/$defs/roads`, …).
- Ejemplos válidos e inválidos: `packages/parser-cslmap/schema/examples/`. Los validan
  tanto ajv como el lector de Rust: todo lo que el schema expresa lo aceptan o rechazan
  los dos, y si divergen falla un test. Lo que JSON Schema no puede expresar está en
  [Reglas solo del lector](#reglas-solo-del-lector): esas reglas las prueban solo los
  tests de Rust, y un test de ajv fija que el schema las deja pasar.
- Lector: `parser_cslmap::vellummap::parse_vellummap_bytes(&[u8]) -> Result<CityData, VellumError>`.
  Produce el mismo `CityData` que `parse_cslmap_bytes`, por el mismo camino de
  construcción.

## Contenedor

Un `.vellummap` es un zip con:

- `manifest.json`: metadatos y la tabla de módulos.
- Un archivo por módulo: JSON para entidades y `.bin` para grillas.

El documento es **estricto**. Estos casos son error, nunca se interpretan en silencio:

| Caso                                                                                                  | Error                          |
| ----------------------------------------------------------------------------------------------------- | ------------------------------ |
| Bytes que no son zip, zip sin `manifest.json` o con más de 13 entradas                                | `InvalidFile`                  |
| `exportSchemaVersion` o `version` de un módulo con major ≠ 1                                          | `UnsupportedVersion { found }` |
| Versión que no tiene la forma `MAJOR.MINOR`                                                           | `InvalidFile`                  |
| `exportedAtUtc` que no es RFC 3339 en UTC con sufijo `Z` (sin zona, con offset, fecha inexistente)    | `InvalidFile`                  |
| Campo desconocido o `null` explícito en el manifest o en un módulo JSON                               | `InvalidFile`                  |
| Módulo desconocido, repetido, obligatorio ausente o con un `path` distinto del fijado                 | `InvalidFile`                  |
| Entrada del zip que el manifest no declara, o módulo declarado que no está en el zip                  | `InvalidFile`                  |
| `codec` distinto del método real de la entrada zip                                                    | `InvalidFile`                  |
| `grid` distinta de la fijada para el módulo, o grilla cuyo tamaño no es `resolución² × bytes`         | `InvalidFile`                  |
| `sha256` distinto del de los bytes descomprimidos                                                     | `InvalidFile`                  |
| Suma de tamaños declarados por encima de 1 GiB                                                        | `InvalidFile`                  |
| Dos entradas del zip con el mismo nombre                                                              | `InvalidFile`                  |
| `sourceId` repetido en su colección, o segmento cuyo nodo de inicio o fin no existe                   | `InvalidFile`                  |
| `width` negativo, o número entero escrito con parte decimal (`1.0`)                                   | `InvalidFile`                  |
| Reglas entre módulos (agua, ids de distrito/parque, nombres de parada, color): ver secciones de abajo | `InvalidFile`                  |

Un `major` futuro se reporta como `UnsupportedVersion` aunque el manifest traiga campos
que v1 no conoce: la versión se lee antes de validar el resto. Se acepta cualquier minor
de major 1 (`1.0`, `1.7`).

**Anti zip bomb.** Antes de inflar una entrada, el lector comprueba el tamaño
descomprimido que declara:

- `manifest.json`: como máximo 1 MiB.
- Módulo JSON: como máximo 256 MiB.
- Grilla: exactamente `resolution² × bytes_por_muestra`.
- Documento completo: la suma de lo que declaran todas las entradas, como máximo 1 GiB.
  Se comprueba antes de inflar ninguna.

Luego verifica que la entrada inflada mida lo declarado. El búfer no se reserva con el
tamaño declarado (como mucho 1 MiB de entrada) y crece con lo que realmente se infla. Todo
se lee en memoria; nada se extrae a disco.

### Reglas solo del lector

JSON Schema no puede expresar estas reglas, así que el schema las deja pasar y solo el
lector las rechaza (con `InvalidFile`):

- Unicidad: `sourceId` único dentro de `nodes`, `segments`, `lines`, `buildings`,
  `districts` y `parks`; cada módulo declarado una sola vez; nombres de entrada del zip
  únicos.
- Referencias: `startNodeSourceId` y `endNodeSourceId` deben existir en `nodes` del mismo
  `roads.json`. Los ids de `districts.bin`/`parks.bin` deben existir en su módulo JSON.
  Las rutas de tránsito, en cambio, **pueden** nombrar segmentos que no están en
  `roads.json`.
- Con `districts.bin` (o `parks.bin`), todo `sourceId` de `districts.json` (o
  `parks.json`) debe caber en un byte de la grilla: 1–255.
- Fechas: `exportedAtUtc` debe ser un día que exista en su mes (`2026-02-30` se rechaza).
  El `pattern` del schema exige la forma y la `Z`; el calendario lo comprueba el lector.
- Enteros: `sourceId`, `elevation`, `frameIndex` y `resolution` no admiten parte decimal.
  `1.0` es válido para el tipo `integer` de JSON Schema, pero el lector lo rechaza.
- Agua: máscara igual a `profundidad > 16` y `depth` presente exactamente cuando está
  `water-depth.bin` (ver [Agua](#agua)).
- Contenedor: `codec` igual al método real de la entrada, `sha256` de los bytes
  descomprimidos, tamaños declarados y presupuesto del documento.

## Manifest

```json
{
  "format": "vellummap",
  "exportSchemaVersion": "1.0",
  "snapshotId": "0f8fad5b-d9cb-469f-a165-70867728950e",
  "parentSnapshotId": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "exportedAtUtc": "2026-09-23T14:05:00Z",
  "gameTime": "2031-05-17T08:00:00",
  "game": {
    "version": "1.21.1-f9",
    "instanceId": "3f2504e0-4f89-11d3-9a0c-0305e82c3301"
  },
  "producer": { "name": "Vellum Bridge", "version": "0.5.0" },
  "city": { "name": "Sample City" },
  "modules": [
    {
      "id": "terrain",
      "path": "terrain.bin",
      "version": "1.0",
      "codec": "deflate",
      "sha256": "…64 hex en minúsculas…",
      "grid": {
        "resolution": 1081,
        "cellSize": 16,
        "sample": "u16le",
        "scale": 0.015625
      }
    }
  ]
}
```

| Campo                 | Obligatorio | Contenido                                                                                                                                                                                                                      |
| --------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `format`              | sí          | Siempre `"vellummap"`.                                                                                                                                                                                                         |
| `exportSchemaVersion` | sí          | Versión del documento, `MAJOR.MINOR`. Hoy `1.0`.                                                                                                                                                                               |
| `snapshotId`          | sí          | ID único de esta exportación (Bridge: un UUID).                                                                                                                                                                                |
| `parentSnapshotId`    | no          | `snapshotId` del que desciende esta exportación. Permite representar ramas del historial.                                                                                                                                      |
| `exportedAtUtc`       | sí          | Momento de la exportación en RFC 3339 UTC: `T` y `Z` en mayúscula, sin offset (`2026-06-10T17:35:58Z`, fracción de segundo opcional). Obligatorio y validado. Vellum lo usa tal cual como fecha de generación (`generatedAt`). |
| `gameTime`            | no          | Fecha dentro del juego (`SimulationManager.m_currentGameTime`). No es un orden fiable.                                                                                                                                         |
| `game.version`        | sí          | Versión del juego, o `"unknown"` si la fuente no la registra.                                                                                                                                                                  |
| `game.instanceId`     | no          | `m_metaData.m_gameInstanceIdentifier`. Algunos mods lo regeneran: no basta como identidad única.                                                                                                                               |
| `producer`            | sí          | `name` y `version` del programa que escribió el archivo.                                                                                                                                                                       |
| `city.name`           | sí          | Nombre de la ciudad.                                                                                                                                                                                                           |
| `modules`             | sí          | Un registro por módulo presente.                                                                                                                                                                                               |

Cada registro de `modules`:

| Campo     | Contenido                                                                                                             |
| --------- | --------------------------------------------------------------------------------------------------------------------- |
| `id`      | Uno de los módulos de la tabla de abajo.                                                                              |
| `path`    | Fijo por `id` en v1.                                                                                                  |
| `version` | Versión del módulo, `MAJOR.MINOR`. Hoy `1.0`.                                                                         |
| `codec`   | `deflate` o `stored`. Debe coincidir con el método real de la entrada zip. Un lector v1 rechaza cualquier otro valor. |
| `sha256`  | SHA-256 de los bytes **descomprimidos** de la entrada, en hex minúscula.                                              |
| `grid`    | Solo en grillas. Forma exacta fijada por el módulo (ver tabla).                                                       |

### Campos pensados para el timelapse

El timelapse no entra en v1, pero el manifest ya guarda lo que no se puede recuperar
después:

1. `snapshotId`, `parentSnapshotId`, `exportedAtUtc` y `gameTime` van por separado. El
   orden de las capturas no se deduce de la fecha del juego.
2. El `codec` por módulo permite añadir otra compresión (zstd) sin cambiar la
   estructura del manifest.
3. El `sha256` de cada módulo es la base para deduplicar módulos que no cambiaron entre
   capturas.
4. Los IDs de CS1 se guardan como `sourceId`. CS1 reutiliza posiciones de buffer, así que
   un `sourceId` no es una identidad histórica: comparar dos exportaciones exige el
   `sourceId` más una huella (prefab y posiciones). El nombre `lineageId` queda libre para
   esa identidad futura.
5. `exportSchemaVersion` más una `version` por módulo.

## Módulos v1

| `id`            | Archivo           | Oblig. | Contenido                                                                                      |
| --------------- | ----------------- | ------ | ---------------------------------------------------------------------------------------------- |
| `terrain`       | `terrain.bin`     | sí     | `RawHeights2`, u16le, 1081², celda 16, escala 1/64 m.                                          |
| `water`         | `water.json`      | sí     | `{ seaLevel, depth? }`.                                                                        |
| `water-mask`    | `water-mask.bin`  | sí     | u8, 1081², celda 16. `1` = mojado, `0` = seco.                                                 |
| `water-depth`   | `water-depth.bin` | no     | Profundidad del agua (`WaterSimulation.Cell.m_height`), u16le, 1081², celda 16, escala 1/64 m. |
| `vegetation`    | `vegetation.bin`  | sí     | `NaturalResourceManager.m_tree`, u8 (0–255), 512², celda 33,75.                                |
| `roads`         | `roads.json`      | sí     | `{ nodes, segments }`.                                                                         |
| `transit`       | `transit.json`    | sí     | `{ lines }`.                                                                                   |
| `buildings`     | `buildings.json`  | sí     | `{ buildings }`.                                                                               |
| `districts`     | `districts.json`  | sí     | `{ districts }`: `sourceId`, `name`, `labelPosition`.                                          |
| `parks`         | `parks.json`      | sí     | `{ parks }`: `sourceId`, `name`, `labelPosition`, `parkType?`.                                 |
| `district-grid` | `districts.bin`   | no     | u8x8, 900², celda 19,2: por celda, 4 ids de distrito y luego sus 4 alphas.                     |
| `park-grid`     | `parks.bin`       | no     | u8x8, 900², celda 19,2: por celda, 4 ids de parque y luego sus 4 alphas.                       |

Un módulo obligatorio sin contenido se escribe vacío (`{ "buildings": [] }`), no se omite.

### Grillas

- Muestras en orden de filas: índice = `fila × resolution + columna`.
- La columna crece en `x` y la fila en `z`, desde −8640 (esquina del mapa) en pasos de
  `cellSize`. La grilla de terreno tiene 1081 vértices por lado: 1080 × 16 = 17 280.
- `u16le`: entero sin signo de 16 bits, little-endian. Metros = valor × `scale`.
- `u8x8`: 8 bytes por celda, `id₁ id₂ id₃ id₄ α₁ α₂ α₃ α₄`, tal como los guarda el
  `DistrictManager` del juego. Id `0` = ninguna área. Todo id distinto de 0 debe existir
  en `districts.json` (o `parks.json`), aunque su alpha sea 0: el productor escribe `0` en
  las ranuras sin uso. Con las alphas se podrán dibujar bordes difuminados; hoy Vellum solo
  valida estas grillas.

### Terreno

`terrain.bin` es `RawHeights2`, la capa que el juego muestra y la que exporta `.cslmap`.
Todavía no se verificó qué modifica `RawHeights` para producir `RawHeights2`
(probablemente edificios o redes que rellenan terreno).

### Agua

- **Mojado** significa profundidad > 16 unidades crudas (25 cm). La máscara es el contrato
  estable: con la simulación corriendo, la profundidad cambia unos 0,5 m en 8 s, pero la
  máscara solo cambia en el 0,15 % de las celdas.
- `seaLevel` es un escalar del juego en metros, no una fuente de agua.
- `water-depth.bin` es opcional. Si está, `water.json` debe traer `depth` con su
  procedencia (y viceversa):
  - `simulationPaused`: si la simulación de agua estaba en pausa al capturar. Una
    profundidad capturada en marcha no se puede comparar celda a celda con otra captura.
  - `frameIndex` (opcional): frame de la simulación de agua al capturar. Entero entre 0
    y 2^53 − 1, el mayor que JSON representa sin pérdida en JavaScript.
- Con profundidad, la máscara debe ser exactamente `profundidad > 16`, celda por celda.
- Sin profundidad, el lector sintetiza `2 × 16 = 32` unidades en cada celda mojada y `0`
  en las secas. El contorno de la tierra sigue la máscara, pero sin la interpolación
  sub-celda que da la profundidad real: la costa no coincide exactamente con la de un
  `.cslmap`.
- **Océano frente a agua interior** no se guarda: es una clasificación derivada que
  calcula el consumidor a partir de la máscara, el terreno y `seaLevel`. Mejorar esa regla
  no exige cambiar el formato.

## Entidades

Todas las posiciones son `{ x, y, z }` en unidades del mundo (`y` vertical). Todos los IDs
son `sourceId` enteros ≥ 0, únicos dentro de su colección.

### `roads.json`

```json
{
  "nodes": [
    {
      "sourceId": 1,
      "position": { "x": 0, "y": 70, "z": 0 },
      "elevation": 0,
      "underground": false
    }
  ],
  "segments": [
    {
      "sourceId": 7,
      "startNodeSourceId": 1,
      "endNodeSourceId": 2,
      "itemClass": "Medium Road",
      "width": 24,
      "points": [{ "x": 0, "y": 70, "z": 0 }]
    }
  ]
}
```

- `elevation` (`NetNode.m_elevation`, 0–255) y `underground` (`NetNode.Flags.Underground`)
  alimentan la clasificación: una calle común en viaducto conserva su `itemClass`, y su
  altura vive solo en los nodos.
- Todo segmento une dos nodos declarados en `nodes`. `width` no puede ser negativo.
- `itemClass` es el nombre del `ItemClass` del prefab. Es la fuente de verdad para
  clasificar la vía.
- `points`: puntos de la curva, de inicio a fin.
- Los bounds del mapa salen de las posiciones de los nodos.

### `transit.json`

```json
{
  "lines": [
    {
      "sourceId": 4,
      "name": "Line 4",
      "transportType": "Bus",
      "color": "#FF6600FF",
      "stops": [
        {
          "sourceId": 1,
          "position": { "x": 0, "y": 70, "z": 0 },
          "name": "Main Street 1",
          "nameDerived": true
        }
      ],
      "route": [7, 8]
    }
  ]
}
```

- `name`: `GetLineName`.
- `transportType`: el nombre de `TransportInfo.TransportType` del juego, sin reducir
  (`Bus`, `EvacuationBus`, `Ship`, …). Vellum lo traduce a su modo de tránsito.
- `color`: el color visible (`displayColor`), `#RRGGBBAA` en hex mayúscula.
- `stops[].sourceId`: el nodo de la parada. `name` es opcional y nunca vacío;
  `nameDerived` exige `name`.
- `route`: `sourceId` de los segmentos de toda la ruta, en orden de recorrido. El lector
  no exige que estén en `roads.json`: en el corpus del spike hay rutas con segmentos que
  ya no existen en la ciudad.

#### Nombres de parada

CS1 base no nombra paradas. El nombre se deriva de la calle de la parada y se marca con
`nameDerived: true`. El productor (Bridge, Story 5.3) aplica esta regla; el lector solo la
valida:

1. Si un mod asignó un nombre (`stopCustomNames`), se usa ese con `nameDerived: false`.
2. Si no, se toma el nombre visible de la calle del segmento de la parada
   (`stopRoadSegments` + `GetSegmentName`).
3. Se agrupan todas las paradas del documento que resuelven a la misma calle, con
   comparación exacta del nombre y sin importar la línea:
   - una sola parada: `<calle>`;
   - varias: `<calle> N`, con `N` desde 1 por orden ascendente del `sourceId` del nodo de
     la parada.
4. Sin calle con nombre, la parada no lleva `name` ni `nameDerived`.

La vista esquemática puede abreviar el nombre al mostrarlo.

### `buildings.json`

```json
{
  "buildings": [
    {
      "sourceId": 12,
      "name": "H1 1x1 Sweatshop01",
      "itemClass": "Low Commercial",
      "serviceType": "CommercialLow",
      "footprint": [{ "x": 10, "y": 70, "z": 10 }]
    }
  ]
}
```

- `name`: el nombre del prefab.
- `serviceType`: el sub-servicio del prefab.
- `footprint`: el polígono de la planta. Su primer punto es el ancla del edificio.

### `districts.json` y `parks.json`

Cada área lleva `sourceId`, `name` y `labelPosition`, el ancla de la etiqueta. Los parques
añaden `parkType`, el nombre de tipo del juego sin reducir (`Generic`, `Zoo`, `Airport`,
…); se omite si no se conoce. Vellum reduce hoy los tipos que no soporta a `None`.

## Qué debe capturar Bridge (Story 5.3)

- Solo elementos con el flag `Created`. Se excluyen las líneas con flag `Temporary`.
- Por segmento: `itemClass` del prefab, ancho, nodos de inicio y fin, y los **puntos
  bezier** de la curva en `points`, en orden de inicio a fin. Las redes no viales o
  invisibles (tuberías, rutas de avión y barco, conexiones) se exportan clasificadas por
  su `itemClass`; no se descartan. Las estructuras `Untouchable` también se exportan: el
  renderer decide si las dibuja.
- Por nodo: posición, `elevation` y `underground`.
- Por edificio: `itemClass`, sub-servicio y el **footprint** como polígono en coordenadas
  del mundo, empezando por la esquina que servirá de ancla.
- Por línea: `GetLineName`, `displayColor`, tipo de transporte, paradas con su posición y
  nombre derivado según la regla de arriba, y la ruta.
- Terreno `RawHeights2`, máscara de agua, `seaLevel` y, si la simulación está en pausa, la
  profundidad con su procedencia.
- `m_tree` completo. Los árboles individuales no entran en v1.
- Manifest: `snapshotId`, `exportedAtUtc` en UTC, `gameTime`, `game.version` y
  `game.instanceId`.

## Conversor de referencia

`parser_cslmap::vellummap::cslmap_to_vellummap(&[u8])` convierte un `.cslmap` en un
`.vellummap`. Sirve para probar la paridad: con cualquier fixture real, abrir el resultado
da el mismo `CityData` que el `.cslmap`, salvo `fileName` y `generatedAt` (que pasa a ser
`<Generated>` convertido a RFC 3339 UTC, ver abajo). No es el exportador de producción.

Lo que `.cslmap` no trae se escribe tal cual es:

- `game.version` queda en `"unknown"`.
- La profundidad lleva `simulationPaused: false` y ningún `frameIndex`. Aquí `false`
  significa «desconocido, no garantizado en pausa»: `.cslmap` no dice si la simulación
  estaba detenida.
- `exportedAtUtc` sale de `<Generated>` (`M/D/YYYY h:mm:ss AM|PM`, p. ej.
  `6/10/2026 5:35:58 PM` → `2026-06-10T17:35:58Z`; `12:00:00 AM` es medianoche y
  `12:00:00 PM` mediodía). `.cslmap` no registra la zona horaria, así que la zona es
  desconocida: el conversor **asume UTC**. La hora real puede estar desplazada por el
  offset del equipo que exportó el `.cslmap`.
- `snapshotId` es el SHA-256 del `.cslmap` de origen: un id direccionado por contenido,
  así que convertir dos veces el mismo archivo da el mismo id. Un productor real (Bridge)
  genera en cambio un id nuevo por exportación.

La conversión falla con `InvalidFile` si el `.cslmap` tiene algo que el documento no puede
representar sin pérdida:

- IDs que no son enteros canónicos, o IDs repetidos;
- valores de terreno que no son enteros en el rango u16;
- `elev` de nodo que no es entero o está fuera de 0–255;
- un `<Node>` sin `<Pos>`;
- un color de línea que no es `#RRGGBBAA`;
- ningún `<Generated>`, o uno que no tiene la forma `M/D/YYYY h:mm:ss AM|PM` o nombra una
  fecha u hora imposible.

Para inspeccionar el formato:

```bash
cargo run --release --example cslmap_to_vellummap --package parser-cslmap -- \
    packages/parser-cslmap/fixtures/altavento.cslmap /tmp/altavento.vellummap
unzip -l /tmp/altavento.vellummap
unzip -p /tmp/altavento.vellummap manifest.json
```
