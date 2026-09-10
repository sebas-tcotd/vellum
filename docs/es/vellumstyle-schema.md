# El schema `.vellumstyle` (v1)

Un archivo `.vellumstyle` es un documento JSON que describe la paleta de colores completa
que Vellum usa para renderizar una ciudad — terreno, agua, vías, edificios, bosques,
tránsito y distritos. Vellum incluye 5 temas built-in (Day, Transit, Classic, Grayscale,
Grayscale + Water) y carga cualquier archivo `.vellumstyle` adicional que un usuario
instale (ver [«Instalación de un tema»](#instalación-de-un-tema) más abajo).

Este documento es la referencia pública y estable para modders y creadores de temas.
Describe el **comportamiento real y actual de la app** — no un comportamiento aspiracional
o planeado.

## Schema legible por máquinas (JSON Schema)

El contrato de esta página también se publica como archivo JSON Schema (2020-12), para que
un editor pueda autocompletar y validar un `.vellumstyle` mientras lo escribes:

```
https://raw.githubusercontent.com/sebas-tcotd/vellum/main/packages/theme-engine/vellumstyle.schema.json
```

Se declara con la propiedad estándar `$schema`:

```json
{
  "$schema": "https://raw.githubusercontent.com/sebas-tcotd/vellum/main/packages/theme-engine/vellumstyle.schema.json",
  "schemaVersion": 1,
  "name": "Mi tema"
}
```

Un archivo `.vellumstyle` es JSON estricto — Vellum lo parsea con `JSON.parse`. Los
comentarios (`//`) y las comas finales **no** están permitidos y hacen que el archivo
entero falle al cargar.

### Cómo decirle a tu editor que `.vellumstyle` es JSON

`.vellumstyle` no es una extensión `.json`, así que por defecto ningún editor lo trata como
JSON y la propiedad `$schema` no hace nada. Asocia la extensión al lenguaje JSON una sola
vez y el autocompletado, la validación y la documentación al pasar el cursor empiezan a
funcionar.

**VS Code** (y derivados) — en tu `settings.json` de usuario o de workspace:

```json
{
  "files.associations": {
    "*.vellumstyle": "json"
  }
}
```

**IDEs de JetBrains** — Settings → Editor → File Types → JSON → agrega el patrón
`*.vellumstyle`.

**Neovim** — `vim.filetype.add({ extension = { vellumstyle = 'json' } })`, con un language
server de JSON (`jsonls`) adjunto.

Detalles que conviene conocer:

- **`$schema` es totalmente opcional y solo sirve para el editor.** Vellum nunca la lee,
  nunca la exige, y ninguno de los cinco temas built-in la declara. Un archivo con ella y
  uno sin ella cargan igual.
- **Solo `name` es obligatorio en la raíz.** Cualquier grupo de nivel superior (`terrain`,
  `roads`, `buildings`, `grid`, `parkAreas`, …) puede omitirse — Vellum rellena el grupo
  ausente con los valores por defecto al cargar el archivo. Ahora bien, dentro de un grupo
  que _sí_ provees, todas sus claves son obligatorias, igual que exige el validador de
  runtime.
- **`schemaVersion` también es opcional en el schema** (Vellum le asigna `1` por defecto) y,
  si está presente, debe ser un entero ≥ 1.
- **Nada está cerrado.** Ningún nivel usa `additionalProperties: false`, así que la regla de
  [puntos de extensión](#puntos-de-extensión) vale tanto en el schema como en runtime.
- **El schema revisa un poco más que la app.** El validador de runtime solo inspecciona las
  hojas de color; el JSON Schema además:
  - tipa las hojas numéricas (`grid.opacity`, `grid.width`) y el arreglo de números
    `grid.dasharray`;
  - exige que `schemaVersion` sea un **entero ≥ 1**, mientras que el paso de migración de la
    app acepta cualquier número finito (`1.5` y `0` cargan sin problema, simplemente no
    corresponden a ninguna ruta de migración conocida).

  Un archivo que tu editor marque por cualquiera de las dos razones igual carga en Vellum —
  el schema simplemente es más estricto ahí.

El archivo se **deriva** de la misma paleta por defecto y de las mismas regex de color con
las que valida la app, y un test falla en CI si el artefacto commiteado se desincroniza
(se regenera con `pnpm --filter @vellum/theme-engine schema:emit`). Eso es lo que impide
que este documento, el schema y el código se separen entre sí.

## Garantía de retrocompatibilidad

Un archivo `.vellumstyle` válido hoy seguirá cargando sin errores en versiones futuras de
Vellum, incluso después de que el schema evolucione (NFR11). Esto se garantiza mediante
dos mecanismos que trabajan juntos:

- **Migración por `schemaVersion`.** Un archivo debería declarar un `schemaVersion` (Vellum
  asume `1` si la clave falta, así que un archivo legacy igual carga). Vellum
  lo pasa por un paso de migración antes de validarlo; cada versión anterior del schema
  tiene su propia ruta de migración hacia el shape actual, así que un archivo antiguo se
  actualiza en memoria en vez de ser rechazado.
- **Los campos desconocidos se ignoran, no se rechazan** (ver
  [Puntos de extensión](#puntos-de-extensión)). Esto significa que una versión futura de Vellum
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
  schemaVersion?: number; // opcional; empieza en 1, y Vellum asume 1 si falta
  name: string; // nombre visible en el pill del selector — el único campo obligatorio
  // ...más todos los campos de RenderStyleParams, abajo (cada grupo opcional; ver arriba)
}
```

`name` es la única clave que un archivo debe declarar. `schemaVersion` y todos los grupos de
estilo son opcionales en el archivo en disco — Vellum los rellena al cargarlo (por eso el
`VellumStyle` en memoria que ve el renderer siempre trae un `schemaVersion: number`).

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

| Campo               | Tipo                  | Descripción                                                                                                                |
| ------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `mapBackground`     | `ColorToken`          | Color de fondo detrás del terreno (visible fuera de los límites del mapa).                                                 |
| `mapFrame`          | `ColorToken`          | Color del marco decorativo alrededor de la extensión del mundo.                                                            |
| `terrain.base`      | `ColorToken`          | Color de elevación base/plana.                                                                                             |
| `terrain.low`       | `ColorToken`          | Color de elevación baja.                                                                                                   |
| `terrain.mid`       | `ColorToken`          | Color de elevación media.                                                                                                  |
| `terrain.high`      | `ColorToken`          | Color de elevación alta.                                                                                                   |
| `contourLine`       | `ColorToken`          | Color de las líneas de contorno del terreno.                                                                               |
| `water`             | `ColorToken`          | Color de los cuerpos de agua (mar y agua interior).                                                                        |
| `forests`           | `ColorToken`          | Color de los marcadores de densidad de bosque/vegetación.                                                                  |
| `transitBackground` | `ColorToken`          | Fondo usado en exports oscuros y reservado para presentaciones centradas en tránsito. Todos los temas built-in lo definen. |
| `roads`             | `RoadColorParams`     | Colores de la red vial, agrupados por jerarquía — ver abajo.                                                               |
| `buildings`         | `BuildingColorParams` | Colores de edificios, agrupados por categoría de zoning — ver abajo.                                                       |
| `districts.fill`    | `ColorToken`          | Color de relleno del marcador de distrito.                                                                                 |
| `districts.label`   | `ColorToken`          | Color del texto de la etiqueta del distrito.                                                                               |
| `grid`              | `GridStyle`           | Estilo de la grilla de proyección 9×9 opcional.                                                                            |
| `parkAreas`         | `ParkAreaColors`      | Colores opcionales de marcadores de áreas de parque DLC; los valores omitidos usan defaults built-in.                      |

`grid` contiene `color`, `opacity`, `width` y `dasharray`. `parkAreas` contiene los
colores opcionales `generic`, `university`, `tradeSchool`, `industry` y `forestry`.
A diferencia de las siete capas visibles para el usuario, estos campos estilizan
subelementos controlados por las opciones avanzadas de basemap y distritos.

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

Cuando Vellum carga un archivo `.vellumstyle`, primero rellena lo que el archivo haya
omitido y luego recorre la estructura esperada verificando que cada leaf de color esté
presente y coincida con `HexColor`/`HslColor`. La distinción que importa es **grupo entero
vs. grupo parcial**:

- **Un grupo omitido por completo no es problema.** Deja `grid` (o `roads`, o `parkAreas`,
  …) fuera del archivo y Vellum sustituye ese grupo por el valor por defecto antes de
  validar. Por eso carga un archivo tan pequeño como
  `{ "name": "Mi tema", "water": "#6db8b7" }`.
- **Un grupo que sí provees tiene que estar completo.** Proveer un grupo _reemplaza_ el
  valor por defecto de ese grupo entero — no hay merge leaf por leaf — así que un objeto
  `roads` sin `roads.ferry`, o un `roads.highway.generic` sin su `casing`, deja un hueco que
  la validación rechaza. Si solo quieres cambiar un color de vía, copia el bloque `roads`
  completo de un tema built-in y edita esa única hoja.

Si **un solo campo** termina ausente o malformado, **todo el archivo** se salta (no solo ese
campo) y una advertencia nombra el path exacto del problema, por ejemplo:

> `day.vellumstyle no es válido: campo roads.highway.generic.fill no reconocido`

Los temas válidos en el mismo directorio siguen cargando normalmente — un archivo roto
nunca bloquea a los demás.

## Puntos de extensión

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

El ejemplo canónico completo es el tema built-in **Day** en
[`apps/desktop/src-tauri/resources/themes/day.vellumstyle`](../../apps/desktop/src-tauri/resources/themes/day.vellumstyle).
Se mantiene como archivo fuente en vez de duplicarse aquí, para que la referencia no
se desvíe del tema que realmente incluye la app. El siguiente fragmento ilustrativo
destaca campos fáciles de omitir y no es un archivo de tema válido por sí solo:

```jsonc
{
  "schemaVersion": 1,
  "name": "My theme",
  "mapFrame": "#e5dcc8",
  "contourLine": "#aa9e86",
  "grid": {
    "color": "#7d705f",
    "opacity": 0.18,
    "width": 1,
    "dasharray": [4, 4],
  },
  "parkAreas": {
    "generic": "#aeb58f",
    "university": "#c5b58c",
    "tradeSchool": "#b99480",
    "industry": "#9b8b9f",
    "forestry": "#8f9c7f",
  },
  // Incluye los demás campos requeridos de RenderStyleParams a partir del tema Day.
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
