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

El documento es **estricto** con todo lo que el lector conoce. Estos casos son error,
nunca se interpretan en silencio:

| Caso                                                                                                  | Error                          |
| ----------------------------------------------------------------------------------------------------- | ------------------------------ |
| Bytes que no son zip, zip sin `manifest.json` o con más de 13 entradas (manifest + 12 módulos)        | `InvalidFile`                  |
| `exportSchemaVersion` o `version` de un módulo con major ≠ 1                                          | `UnsupportedVersion { found }` |
| Versión que no tiene la forma `MAJOR.MINOR`                                                           | `InvalidFile`                  |
| `exportedAtUtc` que no es RFC 3339 en UTC con sufijo `Z` (sin zona, con offset, fecha inexistente)    | `InvalidFile`                  |
| Campo desconocido con un minor conocido, o `null` explícito, en el manifest o en un módulo JSON       | `InvalidFile`                  |
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

### Regla del minor

Un Desktop instalado tiene que abrir lo que escriba un Bridge más nuevo del mismo major.
Por eso el lector es estricto con los minors que conoce y tolerante con los que no:

- El minor se evalúa **por ámbito**. Los campos del manifest (incluidos `game`, `producer`,
  `city`, las entradas de `modules` y su `grid`) dependen de `exportSchemaVersion`. Los de
  cada módulo JSON, de la `version` de ese módulo en el manifest.
- Minor conocido: manifest `1`; módulo `transit` `2`; `buildings` y `districts` `1`; el resto `0`.
- Con un minor **menor o igual** al conocido, un campo desconocido es `InvalidFile`. El
  mensaje dice `unknown field` y la ruta del campo
  (``roads.json: unknown field `segments.0.lanes` ``).
- Con un minor **mayor**, el campo se ignora: la ciudad se dibuja igual que sin él.
- La tolerancia es solo para **campos**. Un `id` de módulo desconocido, un `path` distinto,
  más de 13 entradas en el zip (el manifest más los 12 módulos) o un valor desconocido de un enum (`codec`, `sample`) siguen siendo
  `InvalidFile` en cualquier minor: el contenedor v1 es de rutas fijas, y un lector v1 no
  admite módulos ni rutas nuevos.
- Un campo que el lector sí conoce se valida igual en cualquier minor 1.x (p. ej.
  `city.id` o `buildings[].height` en un documento `1.0`, o `height: -1` en un
  `buildings` `1.5`). Vale también para `stationId` y `classLevel` en un `transit` `1.0`.

**Compatibilidad.** La regla del minor existe desde la versión de Vellum Desktop siguiente
a 0.12.0. Un Desktop 0.12.0 o anterior es estricto con cualquier minor: **rechaza** los
archivos de Bridge 0.9 (manifest `1.1` con `city.id`) por el campo desconocido. Esos
archivos se abren a partir de la versión siguiente.

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
- Enteros: `sourceId`, `elevation`, `frameIndex`, `resolution` y los conteos de distrito
  (`population`, `homes`, `jobs.*`) no admiten parte decimal.
  `1.0` es válido para el tipo `integer` de JSON Schema, pero el lector lo rechaza.
- Agua: máscara igual a `profundidad > 16` y `depth` presente exactamente cuando está
  `water-depth.bin` (ver [Agua](#agua)).
- Contenedor: `codec` igual al método real de la entrada, `sha256` de los bytes
  descomprimidos, tamaños declarados y presupuesto del documento.

Y una en sentido contrario, en la que el lector es **más tolerante** que el schema: la
[regla del minor](#regla-del-minor). El schema rechaza cualquier campo que no declara
(`additionalProperties: false`) porque no puede condicionarlo a la versión; el lector
ignora los campos desconocidos de un minor más nuevo. Un test de ajv fija que el schema
rechaza un manifest `1.7` con un campo nuevo, y los tests de Rust, que el lector lo abre.

## Manifest

```json
{
  "format": "vellummap",
  "exportSchemaVersion": "1.1",
  "snapshotId": "0f8fad5b-d9cb-469f-a165-70867728950e",
  "parentSnapshotId": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "exportedAtUtc": "2026-09-23T14:05:00Z",
  "gameTime": "2031-05-17T08:00:00",
  "game": {
    "version": "1.21.1-f9",
    "instanceId": "3f2504e0-4f89-11d3-9a0c-0305e82c3301"
  },
  "producer": { "name": "Vellum Bridge", "version": "0.9.0-experimental" },
  "city": {
    "name": "Sample City",
    "id": "5b8a3c1e-2f47-4d0a-9e61-7c3f0d2b4a95"
  },
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

| Campo                 | Obligatorio | Contenido                                                                                                                                                                                                                                        |
| --------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `format`              | sí          | Siempre `"vellummap"`.                                                                                                                                                                                                                           |
| `exportSchemaVersion` | sí          | Versión del documento, `MAJOR.MINOR`. `1.1` desde Bridge 0.9 (añade `city.id`); el conversor de referencia escribe `1.0`.                                                                                                                        |
| `snapshotId`          | sí          | ID único de esta exportación (Bridge: un UUID).                                                                                                                                                                                                  |
| `parentSnapshotId`    | no          | `snapshotId` de la exportación anterior de la misma partida (Bridge 0.9). Permite representar ramas del historial (ver abajo).                                                                                                                   |
| `exportedAtUtc`       | sí          | Momento de la exportación en RFC 3339 UTC: `T` y `Z` en mayúscula, sin offset (`2026-06-10T17:35:58Z`, fracción de segundo opcional). Obligatorio y validado. Vellum lo usa tal cual como fecha de generación (`generatedAt`).                   |
| `gameTime`            | no          | Fecha dentro del juego (`SimulationManager.m_currentGameTime`). No es un orden fiable.                                                                                                                                                           |
| `game.version`        | sí          | Versión del juego, o `"unknown"` si la fuente no la registra.                                                                                                                                                                                    |
| `game.instanceId`     | no          | `m_metaData.m_gameInstanceIdentifier`. Algunos mods lo regeneran: no basta como identidad única.                                                                                                                                                 |
| `producer`            | sí          | `name` y `version` del programa que escribió el archivo.                                                                                                                                                                                         |
| `city.name`           | sí          | Nombre de la ciudad.                                                                                                                                                                                                                             |
| `city.id`             | no          | Manifest `1.1` (Bridge 0.9). Identidad estable de la ciudad entre exportaciones: un string opaco no vacío. Bridge escribe un UUID, pero el lector no exige ese formato. Bridge la guarda en la partida. Vellum la expone como `CityData.cityId`. |
| `modules`             | sí          | Un registro por módulo presente.                                                                                                                                                                                                                 |

Cada registro de `modules`:

| Campo     | Contenido                                                                                                                                                 |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`      | Uno de los módulos de la tabla de abajo.                                                                                                                  |
| `path`    | Fijo por `id` en v1.                                                                                                                                      |
| `version` | Versión del módulo, `MAJOR.MINOR`. `1.0`, salvo `buildings` y `districts` (`1.1` desde Bridge 0.8) y `transit` (`1.1`: `stationId`; `1.2`: `classLevel`). |
| `codec`   | `deflate` o `stored`. Debe coincidir con el método real de la entrada zip. Un lector v1 rechaza cualquier otro valor.                                     |
| `sha256`  | SHA-256 de los bytes **descomprimidos** de la entrada, en hex minúscula.                                                                                  |
| `grid`    | Solo en grillas. Forma exacta fijada por el módulo (ver tabla).                                                                                           |

### Campos pensados para el timelapse

El timelapse no entra en v1, pero el manifest ya guarda lo que no se puede recuperar
después. Cada `.vellummap` es una **instantánea** independiente e inmutable: Bridge escribe
un archivo nuevo por exportación. El historial (varias instantáneas de una ciudad en un solo
contenedor) irá en `.quire`, después de v1.0.

1. `snapshotId`, `parentSnapshotId`, `exportedAtUtc` y `gameTime` van por separado. El
   orden de las capturas no se deduce de la fecha del juego.
2. `city.id` agrupa las instantáneas de una misma ciudad. Bridge 0.9 lo genera en la
   primera exportación y lo guarda en la partida (serialización de mods de CS1, clave
   `VellumBridge.Identity`), junto con la última `snapshotId` publicada. **Límite
   conocido:** si el jugador no guarda la partida después de exportar, esa identidad se
   pierde; la próxima carga vuelve a la que estaba guardada (o a ninguna, y la siguiente
   exportación estrena un `city.id`).
3. `parentSnapshotId` es la última exportación publicada de esa partida. Si el jugador
   carga una partida guardada antes de una exportación y vuelve a exportar, dos
   instantáneas comparten padre: el historial se **ramifica**, y el grafo de padres lo
   representa sin perder ninguna rama.
4. El `codec` por módulo permite añadir otra compresión (zstd) sin cambiar la
   estructura del manifest. Un lector v1 rechaza un codec que no conoce, en cualquier
   minor.
5. El `sha256` de cada módulo es la base para deduplicar módulos que no cambiaron entre
   capturas.
6. Los IDs de CS1 se guardan como `sourceId`. CS1 reutiliza posiciones de buffer, así que
   un `sourceId` no es una identidad histórica: comparar dos exportaciones exige el
   `sourceId` más una huella (prefab y posiciones). El nombre `lineageId` queda libre para
   esa identidad futura.
7. `exportSchemaVersion` más una `version` por módulo, con la
   [regla del minor](#regla-del-minor).

## Módulos v1

| `id`            | Archivo           | Oblig. | Contenido                                                                                      |
| --------------- | ----------------- | ------ | ---------------------------------------------------------------------------------------------- |
| `terrain`       | `terrain.bin`     | sí     | `RawHeights2`, u16le, 1081², celda 16, escala 1/64 m.                                          |
| `water`         | `water.json`      | sí     | `{ seaLevel, depth? }`.                                                                        |
| `water-mask`    | `water-mask.bin`  | sí     | u8, 1081², celda 16. `1` = mojado, `0` = seco.                                                 |
| `water-depth`   | `water-depth.bin` | no     | Profundidad del agua (`WaterSimulation.Cell.m_height`), u16le, 1081², celda 16, escala 1/64 m. |
| `vegetation`    | `vegetation.bin`  | sí     | `NaturalResourceManager.m_tree`, u8 (0–255), 512², celda 33,75.                                |
| `roads`         | `roads.json`      | sí     | `{ nodes, segments }`.                                                                         |
| `transit`       | `transit.json`    | sí     | `{ lines }`. `1.1`: `stationId` en las paradas de estación. `1.2`: `classLevel` por línea.     |
| `buildings`     | `buildings.json`  | sí     | `{ buildings }`. `1.1`: prefab en `prefab`, nombre visible en `name`.                          |
| `districts`     | `districts.json`  | sí     | `{ districts }`: `sourceId`, `name`, `labelPosition`; `1.1`: datos de lugar.                   |
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
      "name": "Elm Street",
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
- `name` (opcional): nombre visible de la calle (`NetManager.GetSegmentName`). Se omite en
  redes sin nombre; si está, no puede ser vacío. Vellum lo dibuja como etiqueta de la vía.
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
      "classLevel": 0,
      "color": "#FF6600FF",
      "stops": [
        {
          "sourceId": 1,
          "position": { "x": 0, "y": 70, "z": 0 },
          "name": "Main Street 1",
          "nameDerived": true
        },
        {
          "sourceId": 2,
          "position": { "x": 100, "y": 60, "z": 0 },
          "name": "Central Station",
          "nameDerived": false,
          "stationId": 1001
        }
      ],
      "route": [7, 8]
    }
  ]
}
```

- `name`: `GetLineName`.
- `transportType`: el nombre de `TransportInfo.TransportType` del juego, sin reducir
  (`Bus`, `EvacuationBus`, `Ship`, …). Vellum lo traduce a su modo de tránsito;
  los tours de Parklife (`Pedestrian`, `TouristBus`, `HotAirBalloon`) tienen modos
  propios, igual que `Helicopter`, `EvacuationBus` y `Taxi` en cualquier formato, y un
  tipo que Vellum no reconoce cae en `Unknown`.
- `classLevel` (opcional, módulo `1.2`): el nivel de clase del prefab de la línea
  (`ItemClass.Level` como entero, `0` = `Level1`). El juego usa un mismo `transportType`
  para una línea de ciudad y una interurbana, y el nivel las separa: `Ship` con `0` es un
  barco de pasajeros (`PassengerShip`) y con `1` un ferry; `Airplane` con `0` es un avión
  (`Airplane`) y con `1` un dirigible (`Blimp`); `Bus` con `2` es un bus interurbano
  (`IntercityBus`). Sin `classLevel` (un `transit` anterior a `1.2` o un `.cslmap`) o con
  otro valor, el mapeo es el de siempre: `Ship` → `Ferry`, `Airplane` → `Blimp`,
  `Bus` → `Bus`, sin error. Los niveles se validan con las exportaciones del juego (ver
  ADR-0007).
- `color`: el color visible (`displayColor`), `#RRGGBBAA` en hex mayúscula.
- `stops[].sourceId`: el nodo de la parada. `name` es opcional y nunca vacío;
  `nameDerived` exige `name`.
- `stops[].stationId` (opcional, módulo `1.1`): `sourceId` del edificio de estación al que
  pertenece la parada, el mismo que decide su nombre por estación (paso 2 de
  [Nombres de parada](#nombres-de-parada)). Todas las paradas del mismo edificio llevan el
  mismo valor, aunque sean de líneas o modos distintos (metro y tren en una estación
  multimodal), y así se puede agrupar una estación sin adivinar por nombre o distancia. Las
  paradas de calle no lo llevan. El lector no exige que el edificio esté en
  `buildings.json`. En `CityData` es `TransitStop.stationId` (string, como los demás ids),
  omitido cuando falta; un `.cslmap` nunca lo produce.
- `route`: `sourceId` de los segmentos de toda la ruta, en orden de recorrido. El lector
  no exige que estén en `roads.json`: en el corpus del spike hay rutas con segmentos que
  ya no existen en la ciudad.

#### Nombres de parada

CS1 base no nombra paradas. El nombre se deriva de la calle de la parada y se marca con
`nameDerived: true`. El productor (Bridge, Story 5.3) aplica esta regla; el lector solo la
valida:

1. Si un mod asignó un nombre (`stopCustomNames`), se usa ese con `nameDerived: false`.
2. Si la parada pertenece a un edificio de estación (metro, tren, terminal: el segmento de
   la parada es `Untouchable` y `NetSegment.FindOwnerBuilding` devuelve su dueño, subido a
   la raíz con `Building.FindParentBuilding`; cuenta si tiene IA `TransportStationAI`
   (metro, tren, terminales, puertos y puertas de aeropuerto, no correos ni depósitos) o si
   el segmento es una vía de transporte, como la estación integrada en la terminal de un
   aeropuerto), se nombra por estación con las reglas de
   abajo. Todas las paradas del mismo edificio llevan el mismo nombre, aunque sean de
   líneas distintas. Desde `transit` `1.1` también llevan `stationId` con el `sourceId`
   de ese edificio (si el edificio no se exportó, la parada sigue la regla de calle y no
   lleva `stationId`).
3. Si no, se toma el nombre visible de la calle del segmento de la parada
   (`stopRoadSegments` + `GetSegmentName`).
4. Se agrupan todas las paradas de calle del documento que resuelven a la misma calle, con
   comparación exacta del nombre y sin importar la línea:
   - una sola parada: `<calle>`;
   - varias: `<calle> N`, con `N` desde 1 por orden ascendente del `sourceId` del nodo de
     la parada.
5. Sin calle con nombre, la parada no lleva `name` ni `nameDerived`.

Nombre de una estación, en orden:

1. El nombre propio del edificio, con `nameDerived: false` si lo puso el jugador
   (`Building.Flags.CustomName`) y `nameDerived: true` si es un edificio único que
   integra la estación. El nombre por defecto de una estación («Underground Metro
   Station») nunca se usa.
2. Un landmark a 150 m o menos (plano XZ), con `nameDerived: true`. Son landmarks los
   edificios con `name` en `buildings.json` (renombrados o únicos) que no sean
   estaciones (tengan o no paradas), y los parques con nombre (en su `labelPosition`).
   Cada landmark pertenece solo a la estación más cercana entre las que todavía no
   tienen nombre del jugador (si empatan, a la de menor `sourceId`); cada estación usa
   el más cercano de los suyos (si empatan, el primero del modelo, con los edificios
   antes que los parques). Una estación cuyas paradas llevan todas un nombre de mod no
   compite por landmarks.
3. El título genérico del edificio de servicio sin renombrar más cercano a 150 m o menos
   (policía, bomberos, salud y educación; sin piezas `Untouchable` ni torres de
   vigilancia forestal; si empatan, el de menor `sourceId`), con `nameDerived: true`. Un
   servicio renombrado ya es un landmark y gana en el paso 2. El título es el del idioma
   del juego al exportar.
4. El nombre del área de `parks.json` que contiene a la estación (parques de Parklife,
   campus, áreas industriales, zonas peatonales, aeropuertos), según la grilla de
   parques: el área con nombre de más peso en la celda; si empatan, la primera ranura.
   Con `nameDerived: true`. El distrito no se usa.
5. La calle de acceso del edificio (`m_accessSegment`) o, si no tiene una con nombre, la
   calle con nombre más cercana a 50 m o menos (sin autopistas ni represas; si empatan,
   la de menor `sourceId`), con `nameDerived: true`. Si varias estaciones tienen la
   misma calle, cada una lleva `<calle> / <cruce>`, donde el cruce es la calle (sin
   autopistas ni represas) con otro nombre que llega al extremo de ese segmento más
   cercano a la estación (si hay varias, la primera en orden ordinal; si en ese extremo
   no hay ninguna, se mira el otro). Las que no tienen cruce, o cuyo `<calle> / <cruce>`
   se repite, llevan `<calle> N` desde 1 por `sourceId` ascendente del edificio; si
   queda una sola, lleva `<calle>` a secas.
6. Sin nada de lo anterior, la estación no lleva `name` ni `nameDerived`.

En los pasos 2, 3 y 4, un nombre que terminaría en más de una estación, o que ya lleva
otra estación por un paso anterior, no se usa: esas estaciones pasan al paso siguiente.
En el paso 4, además, ese nombre de área pasa a ser un prefijo: las estaciones que lo
comparten se llaman `<área> - <nombre del paso 5>` (por ejemplo, `Huanacaure - Jackson
Street`). Si el área tiene tres palabras o más, el prefijo son sus iniciales en mayúscula
(`Laurel City Airport` → `LCA - Webb Street`). Las de esa área sin calle llevan el nombre
del área a secas o, si quedan varias, `<área> N` desde 1 por `sourceId` ascendente del
edificio; no cuentan como estaciones sin nombre.

Estos nombres de estación no se agrupan con los de las paradas de calle.

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

- `serviceType`: el sub-servicio del prefab.
- `footprint`: el polígono de la planta. Su primer punto es el ancla del edificio.
- `height` (opcional, **reservado**): altura del edificio en metros, un número finito ≥ 0.
  El lector lo valida con cualquier minor 1.x y no lo usa. Todavía no lo escribe ningún
  productor (Bridge tampoco).

El nombre cambió de sentido en el módulo `1.1` (Bridge 0.8). El lector no despacha por
versión: la presencia de `prefab` basta para leer cada edificio sin ambigüedad.

- **Sin `prefab` (módulo `1.0`: Bridge 0.7, conversor de referencia):** `name` es
  obligatorio y es el nombre del prefab. `customName` e `historical` no se admiten.
- **Con `prefab` (módulo `1.1`):**
  - `prefab`: el nombre del prefab.
  - `name` (opcional, nunca vacío): el nombre que ve el jugador (`GetBuildingName`). Solo
    lo llevan los edificios que el jugador renombró y los únicos (servicio `Monument`:
    monumentos, maravillas, landmarks; no sus sub-edificios, que solo tienen una clave
    interna). Para el resto el juego solo da el título del
    tipo («Police Station», «Boulder #4») o, en un RICO, un nombre aleatorio: no se
    exporta, y Vellum muestra la categoría del edificio.
  - `customName` (opcional): `true` si el jugador lo renombró (`Building.Flags.CustomName`).
    Exige `name`. Bridge lo escribe solo cuando es `true`.
  - `historical` (opcional): `true` si es histórico (`Building.Flags.Historical`). Bridge
    lo escribe solo cuando es `true`, también en un RICO sin nombre.

```json
{
  "sourceId": 812,
  "prefab": "Library",
  "name": "Administração",
  "customName": true,
  "itemClass": "Education Facility",
  "serviceType": "None",
  "footprint": [{ "x": 20, "y": 60, "z": 20 }]
}
```

En `CityData`, `Building.name` sigue siendo el prefab en ambos formatos. El lector lleva el
`name` de un módulo `1.1` a `displayName`, y `customName` e `historical` a los campos del
mismo nombre. Los tres se omiten cuando faltan, y un `.cslmap` nunca los produce.

### `districts.json` y `parks.json`

Cada área lleva `sourceId`, `name` y `labelPosition`, el ancla de la etiqueta. Los parques
añaden `parkType`, el nombre de tipo del juego sin reducir (`Generic`, `Zoo`, `Airport`,
…); se omite si no se conoce. Vellum reduce hoy los tipos que no soporta a `None`.

Desde el módulo `districts` `1.1` (Bridge 0.8), cada distrito trae además sus datos de
lugar. Los cuatro campos son opcionales para el lector (un documento `1.0` no los tiene),
pero Bridge los escribe siempre: cero es un dato, no una ausencia.

| Campo             | Contenido                                                                                                                                            |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `population`      | Habitantes (`m_populationData.m_finalCount`). Entero ≥ 0.                                                                                            |
| `homes`           | Hogares (`m_residentialData.m_finalHomeOrWorkCount`). Entero ≥ 0.                                                                                    |
| `jobs`            | `{ commercial, industrial, office }`: empleos por sector (`m_<sector>Data.m_finalHomeOrWorkCount`). Los tres son obligatorios; otro sector es error. |
| `specializations` | Nombres de las especializaciones activas del juego sin reducir (`Tourist`, `Hightech`, …), sin `None`. `[]` si no hay ninguna; ningún nombre vacío.  |

```json
{
  "sourceId": 3,
  "name": "Centro",
  "labelPosition": { "x": 0, "y": 0, "z": 0 },
  "population": 0,
  "homes": 0,
  "jobs": { "commercial": 0, "industrial": 0, "office": 0 },
  "specializations": []
}
```

Un valor negativo, `null` o con parte decimal es `InvalidFile`. En `CityData`, `District`
expone `population`, `homes`, `jobs` y `specializations` tal cual: presentes (con ceros y
`[]`) si el documento los trae, omitidos si no. Los parques no llevan datos de lugar.

#### Prueba del atlas

Vellum es un mapa, no un panel del juego. Un dato entra en el documento si describe el
lugar como lo haría un atlas: población, hogares, empleos por sector, especialización,
nombres. Las mecánicas del juego no pasan esa prueba y no se exportan aunque la captura
cruda (`raw` del Raw Snapshot) las exponga: políticas, felicidad, crimen, consumo, valor
del suelo, edades y educación. La superficie tampoco se exporta: se deriva de la grilla de
áreas.

## Qué debe capturar Bridge (Story 5.3)

- Solo elementos con el flag `Created`. Se excluyen las líneas con flag `Temporary`.
- Por segmento: `itemClass` del prefab, ancho, nombre visible de la calle, nodos de inicio y fin, y los **puntos
  bezier** de la curva en `points`, en orden de inicio a fin. Las redes no viales o
  invisibles (tuberías, rutas de avión y barco, conexiones) se exportan clasificadas por
  su `itemClass`; no se descartan. Las estructuras `Untouchable` también se exportan: el
  renderer decide si las dibuja.
- Por nodo: posición, `elevation` y `underground`.
- Por edificio: `itemClass`, sub-servicio y el **footprint** como polígono en coordenadas
  del mundo, empezando por la esquina que servirá de ancla. Desde Bridge 0.8, el prefab en
  `prefab`, el nombre visible y las marcas `customName` e `historical` (ver
  [`buildings.json`](#buildingsjson)). Un nombre que no se puede leer no aborta la
  exportación: el edificio sale sin `name` y se cuenta como límite.
- Por distrito, desde Bridge 0.8: población, hogares, empleos por sector y
  especializaciones (ver [`districts.json` y `parks.json`](#districtsjson-y-parksjson)).
- Por línea: `GetLineName`, `displayColor`, tipo de transporte, paradas con su posición y
  nombre derivado según la regla de arriba, y la ruta. Desde `transit` `1.1`, las paradas
  de un edificio de estación exportado llevan `stationId`; desde `transit` `1.2`, cada
  línea lleva el nivel de clase de su prefab en `classLevel`.
- Terreno `RawHeights2`, máscara de agua, `seaLevel` y la profundidad con su procedencia.
  Desde Bridge 0.9, si el juego está en marcha Bridge pausa la simulación durante la
  extracción (mensaje «Capturando tu ciudad…») y la reanuda al terminar, aunque falle; si
  el jugador ya lo tenía en pausa, lo deja en pausa. Así `water-depth.bin` sale siempre de
  un estado quieto (`simulationPaused: true`). La escritura corre en otro hilo, ya con el
  juego reanudado.
- `m_tree` completo. Los árboles individuales no entran en v1.
- Manifest: `snapshotId`, `exportedAtUtc` en UTC, `gameTime`, `game.version` y
  `game.instanceId`. Desde Bridge 0.9 (manifest `1.1`): `city.id` y, desde la segunda
  exportación de la partida, `parentSnapshotId`.

### Dónde publica Bridge

Cada exportación es un archivo nuevo en `Documentos/Vellum Bridge/<ciudad>/<ciudad> <fecha y
hora locales>.vellummap` (p. ej. `Vellum Bridge/San Rico/San Rico 2026-10-01
020217.vellummap`). La carpeta y el archivo usan el mismo nombre de ciudad saneado (`con` →
`con_`, `a/b` → `a_b`, sin nombre → `Ciudad`); si el nombre ya existe se añade ` (2)`,
` (3)`, … dentro de la carpeta de la ciudad, sin sobrescribir.

- La hora del nombre es la local del equipo, solo para que el jugador reconozca el
  archivo. `exportedAtUtc` y la fecha interna del zip siguen en UTC, y Vellum no deduce
  orden ni fecha del nombre del archivo.
- **Límite conocido:** una ciudad renombrada en el juego estrena carpeta con el nombre
  nuevo; la anterior no se toca. Lo que une las exportaciones de una misma ciudad es
  `city.id`, no la carpeta: el timeline las reunirá por ese campo.
- Las exportaciones sueltas en `Vellum Bridge/` de versiones anteriores no se mueven ni
  se renombran. Los `.part` huérfanos se borran de la carpeta de la ciudad y de la raíz.

## Conversor de referencia

`parser_cslmap::vellummap::cslmap_to_vellummap(&[u8])` convierte un `.cslmap` en un
`.vellummap`. Sirve para probar la paridad: con cualquier fixture real, abrir el resultado
da el mismo `CityData` que el `.cslmap`, salvo `fileName` y `generatedAt` (que pasa a ser
`<Generated>` convertido a RFC 3339 UTC, ver abajo). No es el exportador de producción.

Lo que `.cslmap` no trae se escribe tal cual es:

- `game.version` queda en `"unknown"`.
- El manifest se escribe en `1.0`, sin `city.id` ni `parentSnapshotId`: un `.cslmap` no
  tiene identidad de ciudad.
- Todos los módulos se escriben en `1.0`: los edificios llevan el prefab en `name` y los
  distritos no llevan datos de lugar, porque `.cslmap` no los tiene.
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
