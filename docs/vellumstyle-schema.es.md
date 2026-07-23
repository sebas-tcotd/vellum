# El schema `.vellumstyle` (v1)

Un archivo `.vellumstyle` es un documento JSON que describe la paleta de colores completa
que Vellum usa para renderizar una ciudad — terreno, agua, vías, edificios, bosques,
tránsito y distritos. Vellum incluye 5 temas built-in (Day, Transit, Classic, Grayscale,
Grayscale + Water) y carga cualquier archivo `.vellumstyle` adicional que un usuario
instale (ver [«Instalación de un tema»](#instalación-de-un-tema) más abajo).

Este documento es la referencia pública y estable para modders y creadores de temas.
Describe el **comportamiento real y actual de la app** — no un comportamiento aspiracional
o planeado.

## Garantía de retrocompatibilidad

Un archivo `.vellumstyle` válido hoy seguirá cargando sin errores en versiones futuras de
Vellum, incluso después de que el schema evolucione (NFR11). Esto se garantiza mediante
dos mecanismos que trabajan juntos:

- **Migración por `schemaVersion`.** Todo archivo debe declarar un `schemaVersion`. Vellum
  lo pasa por un paso de migración antes de validarlo; cada versión anterior del schema
  tiene su propia ruta de migración hacia el shape actual, así que un archivo antiguo se
  actualiza en memoria en vez de ser rechazado.
- **Los campos desconocidos se ignoran, no se rechazan** (ver
  [Extension points](#extension-points)). Esto significa que una versión futura de Vellum
  puede añadir campos opcionales nuevos al schema sin romper archivos escritos antes de que
  esos campos existieran, y un archivo escrito para un schema más nuevo que termine
  cargándose en una versión más antigua de Vellum también carga — la versión antigua
  simplemente ignora los campos que no reconoce.

### `schemaVersion` es un entero, no un string semver

`schemaVersion` empieza en `1` y es un **entero plano**, no un string
`"major.minor.patch"`. Todos los temas built-in incluyen `"schemaVersion": 1`. Cambios
disruptivos futuros del schema incrementan este entero (`2`, `3`, ...); el paso de
migración de Vellum tiene una rama `case` por cada versión pasada. No hay un rastreo
separado de minor/patch — cambios aditivos y no disruptivos (campos opcionales nuevos) no
requieren incrementar `schemaVersion` en absoluto, ya que archivos antiguos sin esos campos
siguen validando bajo la misma versión gracias a la regla de extension points de arriba.

## Estructura de nivel superior

```ts
interface VellumStyle {
  schemaVersion: number; // empieza en 1
  name: string; // nombre visible en el pill del selector de temas
  // ...más todos los campos de RenderStyleParams, abajo
}
```

## Tipos de color

Todo campo de color del schema acepta uno de dos formatos de string:

- **`HexColor`** — `#rgb`, `#rgba`, `#rrggbb`, o `#rrggbbaa` (3, 4, 6 u 8 dígitos hex
  después del `#`). Ejemplo: `"#f2efe9"`.
- **`HslColor`** — un string de función CSS `hsl(...)`. El matiz puede llevar
  opcionalmente un sufijo `deg`, saturación/luminosidad son porcentajes, y un canal alfa
  opcional puede seguir después de una coma o una `/`. Ejemplo: `"hsl(210, 40%, 60%)"`.

Ningún otro formato de color (`rgb()`, nombres CSS como `"red"`, etc.) es aceptado. Un
campo que no coincide con ninguno de los dos patrones hace fallar la validación de **todo
el archivo** — ver [Comportamiento de validación](#comportamiento-de-validación).

## Campos de `RenderStyleParams`

| Campo               | Tipo                  | Descripción                                                                                                                                                                                            |
| ------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `mapBackground`     | `ColorToken`          | Color de fondo detrás del terreno (visible fuera de los límites del mapa).                                                                                                                             |
| `terrain.base`      | `ColorToken`          | Color de elevación base/plana.                                                                                                                                                                         |
| `terrain.low`       | `ColorToken`          | Color de elevación baja.                                                                                                                                                                               |
| `terrain.mid`       | `ColorToken`          | Color de elevación media.                                                                                                                                                                              |
| `terrain.high`      | `ColorToken`          | Color de elevación alta.                                                                                                                                                                               |
| `water`             | `ColorToken`          | Color de los cuerpos de agua (mar y agua interior).                                                                                                                                                    |
| `forests`           | `ColorToken`          | Color de los marcadores de densidad de bosque/vegetación.                                                                                                                                              |
| `transitBackground` | `ColorToken`          | Reservado para la función de dimming del tema Transit. Todos los temas built-in lo definen; hoy no hay ningún comportamiento visual independiente ligado a este campo más allá de ser un color válido. |
| `roads`             | `RoadColorParams`     | Colores de la red vial, agrupados por jerarquía — ver abajo.                                                                                                                                           |
| `buildings`         | `BuildingColorParams` | Colores de edificios, agrupados por categoría de zoning — ver abajo.                                                                                                                                   |
| `districts.fill`    | `ColorToken`          | Color de relleno del marcador de distrito.                                                                                                                                                             |
| `districts.label`   | `ColorToken`          | Color del texto de la etiqueta del distrito.                                                                                                                                                           |

### `roads` (`RoadColorParams`)

Cada leaf de este árbol es un par `{ fill, casing }` (`RoadCategoryColors`) — `fill` colorea
la superficie de la vía, `casing` colorea el contorno dibujado alrededor para dar contraste
figura-fondo. Los **anchos** de vía nunca forman parte de este schema — son una constante
fija del renderer, no un asunto del tema.

| Path                   | Variantes                                                                |
| ---------------------- | ------------------------------------------------------------------------ |
| `roads.highway`        | `generic` — autopistas principales y rampas conectoras                   |
| `roads.largeArterial`  | `generic` — arteriales equivalentes a 6 carriles                         |
| `roads.mediumArterial` | `generic` — arteriales equivalentes a 4 carriles                         |
| `roads.local`          | `generic`, `gravel` — calles locales de 2 carriles                       |
| `roads.pedestrian`     | `path`, `way`, `street` — vías exclusivamente peatonales                 |
| `roads.rail`           | `train`, `metro` — infraestructura de tránsito ferroviario               |
| `roads.ferry`          | (leaf único, sin variantes) — rutas de transporte acuático (ferry/barco) |

`train` corresponde a `icls="Train Track"` (y su variante túnel), `metro` a `icls="Metro Track"`
(y su variante túnel). Ningún otro modo ferroviario (tram, monorriel) tiene un `itemClass`
distinto en la exportación `.cslmap` de CS1 — los tranvías circulan sobre segmentos de vía
normales — por eso el schema no tiene un leaf para ellos.

### `buildings` (`BuildingColorParams`)

Cada leaf es un par `{ fill, stroke }` (`BuildingCategoryColors`) — `fill` colorea la huella
del edificio, `stroke` colorea su contorno. Los edificios se colorean según
`Building.serviceType` (mapeado 1:1 desde el atributo `subsrv` del `.cslmap`); el mapeo
completo `subsrv` → categoría vive en `BUILDING_SERVICE_TYPE_CATEGORY`
(`packages/core/src/types/theme.ts`) y se resume aquí:

| Path                    | Variantes                                      | Valores `subsrv` de ejemplo mapeados aquí                                       |
| ----------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------- |
| `buildings.residential` | `low`, `high`, `selfSufficient`                | `ResidentialLow/High`, `ResidentialLow/HighEco`                                 |
| `buildings.commercial`  | `low`, `high`, `leisure`, `tourism`, `organic` | `CommercialLow/High`, `CommercialLeisure`, `CommercialTourist`, `CommercialEco` |
| `buildings.office`      | `generic`, `tech`, `financial`                 | `OfficeGeneric`, `OfficeHightech`, `OfficeFinancial`                            |
| `buildings.industry`    | `generic`, `forestry`, `ore`, `oil`, `farming` | `IndustrialGeneric/Forestry/Ore/Oil/Farming`, `PlayerIndustryForestry`          |
| `buildings.civic`       | `publicTransport`, `education`, `services`     | `PublicTransport*`, `PlayerEducation*`, `BeautificationParks`                   |
| `buildings.none`        | (leaf único, sin variantes)                    | `None` — edificios sin zoning e hitos (el caso más frecuente)                   |

Cualquier valor `subsrv` no listado arriba — incluyendo el fallback propio del parser
`'unknown'` — resuelve a `buildings.civic.services`.

## Comportamiento de validación

Cuando Vellum carga un archivo `.vellumstyle`, recorre la estructura esperada y verifica
que cada leaf de color esté presente y coincida con `HexColor`/`HslColor`. Si **un solo
campo** falta o está malformado, **todo el archivo** se salta (no solo ese campo) y una
advertencia nombra el path exacto del problema, por ejemplo:

> `day.vellumstyle no es válido: campo roads.highway.generic.fill no reconocido`

Los temas válidos en el mismo directorio siguen cargando normalmente — un archivo roto
nunca bloquea a los demás.

## Extension points

Cualquier campo presente en un archivo `.vellumstyle` que no forme parte del schema de
arriba — al nivel superior o anidado dentro de un grupo existente — se **ignora
silenciosamente**. No causa un error de validación y no tiene efecto en el renderizado.
Esto permite que un creador de temas añada sus propios metadatos (p. ej. un campo
`_authorNotes` o `_website`) sin arriesgar incompatibilidad futura, y permite que Vellum
añada campos opcionales nuevos más adelante sin romper archivos existentes. Es una
propiedad estructural de cómo la validación recorre el schema (solo se revisan los campos
conocidos), no un caso especial que haya que solicitar — ya funciona hoy, para cualquier
campo no reconocido, sin sintaxis adicional.

## Ejemplo completo

El tema built-in **Day**, reproducido literalmente
(`apps/desktop/src-tauri/resources/themes/day.vellumstyle`):

```json
{
  "schemaVersion": 1,
  "name": "Day",
  "mapBackground": "#f2efe9",
  "terrain": {
    "base": "#f2efe9",
    "low": "#9fd17a",
    "mid": "#e4dfc9",
    "high": "#c9ad7f"
  },
  "water": "#aad3df",
  "forests": "#cdebb0",
  "transitBackground": "#1a1a2e",
  "roads": {
    "highway": {
      "generic": { "fill": "#4a4a4a", "casing": "#2e2e2e" }
    },
    "largeArterial": {
      "generic": { "fill": "#6b6b6b", "casing": "#4a4a4a" }
    },
    "mediumArterial": {
      "generic": { "fill": "#8c8c8c", "casing": "#6b6b6b" }
    },
    "local": {
      "generic": { "fill": "#b0afaa", "casing": "#8c8c8c" },
      "gravel": { "fill": "#c9c2b0", "casing": "#a69c88" }
    },
    "pedestrian": {
      "path": { "fill": "#a08770", "casing": "#7a6754" },
      "way": { "fill": "#b09d88", "casing": "#8b7d6b" },
      "street": { "fill": "#a08770", "casing": "#7a6754" }
    },
    "rail": {
      "train": { "fill": "#ececec", "casing": "#4a4a4a" },
      "metro": { "fill": "#ececec", "casing": "#e4572e" }
    },
    "ferry": { "fill": "#4a90a4", "casing": "#4a90a4" }
  },
  "buildings": {
    "residential": {
      "low": { "fill": "#d9cba3", "stroke": "#b8a47d" },
      "high": { "fill": "#c9b48a", "stroke": "#a38f68" },
      "selfSufficient": { "fill": "#c3d9a8", "stroke": "#9db885" }
    },
    "commercial": {
      "low": { "fill": "#e8b4a0", "stroke": "#c98f7a" },
      "high": { "fill": "#de9c86", "stroke": "#ba7a65" },
      "leisure": { "fill": "#e8c4e0", "stroke": "#c29ab8" },
      "tourism": { "fill": "#e8d4a0", "stroke": "#c2ad78" },
      "organic": { "fill": "#b8d4a8", "stroke": "#94ad82" }
    },
    "office": {
      "generic": { "fill": "#a8c4d9", "stroke": "#7fa0b8" },
      "tech": { "fill": "#8fb8d9", "stroke": "#6b93b8" },
      "financial": { "fill": "#7a9cc2", "stroke": "#5c7da3" }
    },
    "industry": {
      "generic": { "fill": "#d9c97a", "stroke": "#b8a85c" },
      "forestry": { "fill": "#a8c47a", "stroke": "#86a35c" },
      "ore": { "fill": "#b89478", "stroke": "#96755c" },
      "oil": { "fill": "#8c8570", "stroke": "#6b6554" },
      "farming": { "fill": "#c4b87a", "stroke": "#a3985c" }
    },
    "civic": {
      "publicTransport": { "fill": "#c2a8d9", "stroke": "#9c82b8" },
      "education": { "fill": "#a8d9c4", "stroke": "#82b89c" },
      "services": { "fill": "#d9a8a8", "stroke": "#b88282" }
    },
    "none": { "fill": "#c8bfb5", "stroke": "#a09585" }
  },
  "districts": { "fill": "#e8d97a", "label": "#2e2e2e" }
}
```

## Instalación de un tema

1. Copia tu archivo `.vellumstyle` al directorio de temas de usuario de Vellum (se crea
   automáticamente la primera vez que Vellum se ejecuta, si aún no existe):

   | Plataforma | Ruta                                                      |
   | ---------- | --------------------------------------------------------- |
   | macOS      | `~/Library/Application Support/com.vellum.desktop/themes` |
   | Windows    | `%APPDATA%\com.vellum.desktop\themes`                     |
   | Linux      | `~/.local/share/com.vellum.desktop/themes`                |

2. Reinicia Vellum. Los temas se leen una sola vez al arrancar — no hay hot-reload del
   directorio de temas de usuario mientras la app está corriendo.
3. Tu tema aparece en el selector de temas junto a los 5 temas built-in, usando su nombre
   de archivo (sin la extensión `.vellumstyle`) como id estable y su campo `name` como
   etiqueta visible en el pill.

Si tu archivo usa el mismo nombre de archivo (id) que un tema built-in (p. ej.
`day.vellumstyle`), tu versión toma precedencia silenciosamente sobre la built-in — esto te
permite sobrescribir un tema built-in sin ninguna configuración especial.
