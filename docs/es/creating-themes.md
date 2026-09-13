# Crear y depurar un tema

Esta guía te lleva de «quiero mis propios colores» a «mi tema aparece en el selector», y
te dice qué hacer cuando Vellum rechaza el archivo. Es un recorrido, no una referencia:
cada campo, tipo y regla está definido en
[El schema `.vellumstyle`](vellumstyle-schema.md), y esta guía enlaza a la sección
correspondiente en vez de repetirla.

Describe la app tal como se comporta hoy: los temas se leen una sola vez al arrancar, así
que cada cambio exige reiniciar Vellum.

## 1. Parte de un ejemplo oficial

Copia uno de los ejemplos oficiales de
[`packages/theme-engine/examples`](../../packages/theme-engine/examples) y renómbralo. El
nombre del archivo (sin `.vellumstyle`) pasa a ser el id estable del tema; `name` es la
etiqueta que se ve en la pastilla del selector.

| Ejemplo                                                                             | Úsalo cuando                                                                                                              |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| [`minimal.vellumstyle`](../../packages/theme-engine/examples/minimal.vellumstyle)   | Quieres cambiar unos pocos colores de nivel superior y conservar el resto de grupos con los valores por defecto built-in. |
| [`complete.vellumstyle`](../../packages/theme-engine/examples/complete.vellumstyle) | Quieres controlarlo todo. Declara cada grupo con los valores del tema built-in **Day**, listo para editar hoja por hoja.  |

CI verifica ambos ejemplos cada vez que cambian el motor de temas, sus ejemplos o estas
guías: deben pasar el JSON Schema publicado, cargar en Vellum sin avisos y usar solo
claves cartográficas del contrato. `minimal.vellumstyle` es un tema de partida pequeño y
útil (solo `name` es estrictamente obligatorio, pero un tema sin colores se ve igual que
los valores por defecto):

```json
{
  "$schema": "https://raw.githubusercontent.com/sebas-tcotd/vellum/main/packages/theme-engine/vellumstyle.schema.json",
  "schemaVersion": 1,
  "name": "Mi tema mínimo",
  "mapBackground": "#efe8d8",
  "water": "#5f9ea0",
  "forests": "#6f8f5f"
}
```

## 2. Ábrelo en un editor que entienda el schema

Los ejemplos declaran `$schema`, que apunta al
[`vellumstyle.schema.json`](../../packages/theme-engine/vellumstyle.schema.json)
publicado. En cuanto tu editor trate `.vellumstyle` como JSON (ver
[Cómo decirle a tu editor que `.vellumstyle` es JSON](vellumstyle-schema.md#cómo-decirle-a-tu-editor-que-vellumstyle-es-json)),
tendrás autocompletado, documentación al pasar el cursor y errores en línea mientras
escribes.

`$schema` es opcional. Vellum nunca lo lee: borrar la línea no cambia en nada cómo carga
el archivo, y los temas built-in no lo declaran. Consulta
[Schema legible por máquinas](vellumstyle-schema.md#schema-legible-por-máquinas-json-schema)
para los pocos casos en que el schema es más estricto que la app.

Mantén el archivo como JSON estricto: sin comentarios ni comas finales.

## 3. Edita los colores

- **Un grupo es todo o nada.** Si omites un grupo (`roads`, `buildings`, `grid`, …),
  Vellum usa el valor por defecto built-in. Si lo incluyes, debes incluir todas sus
  claves: no hay fusión hoja por hoja. Para cambiar un solo color de vía, copia el bloque
  `roads` entero de `complete.vellumstyle` y edita esa hoja. Detalles en
  [Comportamiento de validación](vellumstyle-schema.md#comportamiento-de-validación).
- **Los colores son `#hex` o `hsl(...)`.** Sirven `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`
  y `hsl(210, 40%, 60%)`; no sirven `rgb()` ni colores con nombre como `red`. Ver
  [Tipos de color](vellumstyle-schema.md#tipos-de-color).
- **Qué pinta cada campo** está en
  [Campos de `RenderStyleParams`](vellumstyle-schema.md#campos-de-renderstyleparams), con
  los niveles de vía y las categorías de edificio en sus propias tablas.
- **Tus propios metadatos están permitidos.** Un campo que Vellum no conoce (`_author`,
  `_notes`, …) se ignora en vez de rechazarse. Ver
  [Puntos de extensión](vellumstyle-schema.md#puntos-de-extensión).

## 4. Instálalo y reinicia

1. Copia el archivo al directorio de temas de usuario de tu plataforma, listado en
   [Instalación de un tema](vellumstyle-schema.md#instalación-de-un-tema) (en macOS,
   `~/Library/Application Support/com.vellum.desktop/themes`).
2. Cierra y vuelve a abrir Vellum. No hay recarga en caliente: tras cada edición, reinicia
   de nuevo.
3. Tu tema aparece en el selector con su `name`. Un archivo con el nombre de un tema
   built-in (por ejemplo `day.vellumstyle`) reemplaza a ese built-in mientras sea válido.

## 5. Depura un tema rechazado

Cuando un archivo no pasa la validación, Vellum omite el archivo entero, sigue cargando
los demás temas y muestra un toast con el tema, la ruta del campo y el motivo:

> `Mi tema no es válido: el campo roads.highway falta`

El toast usa el `name` del tema (o el nombre del archivo si no tiene un `name` usable) y
sigue el idioma de la interfaz. Si el archivo rechazado reemplaza a un tema built-in, el
built-in sigue disponible.

Busca el motivo en la tabla y aplica la corrección:

| El toast dice                                                   | Regla / campo | Causa                                                                                                                                                                        | Corrección                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `el campo name falta`                                           | `required`    | No hay `name`, o es un string vacío.                                                                                                                                         | Añade `"name": "Mi tema"` en la raíz.                                                                                                                                                                                                                                            |
| `el campo roads.highway falta` (cualquier ruta de grupo)        | `required`    | Incluiste un grupo pero te faltó una de sus claves.                                                                                                                          | Añade la clave que falta copiándola de `complete.vellumstyle`, o elimina el grupo entero para volver a los valores por defecto.                                                                                                                                                  |
| `el campo root tiene un tipo incorrecto`                        | `type`        | El archivo no es un objeto JSON (por ejemplo `[]` o un string suelto).                                                                                                       | Envuelve el tema en `{ … }`.                                                                                                                                                                                                                                                     |
| `el campo name tiene un tipo incorrecto` (o una ruta de grupo)  | `type`        | `name` no es un string, o un grupo es un arreglo o un string en vez de un objeto.                                                                                            | Dale a `name` un valor string; dale al grupo la forma de objeto que muestra la referencia.                                                                                                                                                                                       |
| `el campo water no es un color válido (usa #rrggbb o hsl(...))` | `color-token` | Una hoja de color está presente pero no es `#hex` ni `hsl(...)` (`"red"`, `rgb(…)`, un dígito mal escrito).                                                                  | Reemplaza el valor por un color `#rrggbb` o `hsl(...)`.                                                                                                                                                                                                                          |
| `JSON malformado`                                               | `JSON`        | Falló `JSON.parse`: un comentario, una coma final, una comilla o llave de menos.                                                                                             | Abre el archivo en un editor con soporte JSON; te señala el carácter exacto. En este caso el toast no da ruta de campo.                                                                                                                                                          |
| Ningún toast, y el tema no está en el selector                  | —             | Vellum nunca leyó el archivo: directorio equivocado, extensión distinta de `.vellumstyle` (p. ej. `.vellumstyle.json`), aún sin reiniciar, o un archivo ilegible o no UTF-8. | Revisa la ruta y la extensión, guarda el archivo como UTF-8 y reinicia. Un archivo ilegible o no UTF-8 se omite solo con una línea de log nativo (`[load_themes] skipping …` en la salida de error estándar, visible si arrancas Vellum desde una terminal), nunca con un toast. |

Se informa un solo problema por archivo. Tras corregirlo, reinicia: si el toast vuelve con
otra ruta, repite.

### Migración: archivos antiguos y más nuevos

Algunas diferencias entre tu archivo y el schema actual no son errores y no generan
toast. La [política de versiones y evolución](vellumstyle-schema.md#versiones-soportadas-y-política-de-evolución)
las cubre por completo:

- **Sin `schemaVersion`**: el archivo se trata como versión `1` y carga normalmente.
  Añade `"schemaVersion": 1` para dejar clara tu intención.
- **`schemaVersion` mayor que la versión actual**: carga best-effort. Si le falta un color
  que el Vellum actual necesita, recibes el toast `required` habitual para esa ruta; añade
  la clave o elimina el grupo.
- **Campos retirados** como `roads.*.industrial` o `roads.rail.tram`: se ignoran como
  puntos de extensión. Son inofensivos, pero puedes borrarlos.
- **Grupos añadidos después de escribir tu archivo** (`mapFrame`, `contourLine`, `grid`,
  `parkAreas`): se rellenan con los valores por defecto built-in. Cópialos de
  `complete.vellumstyle` si quieres darles estilo.

Consulta la [garantía de retrocompatibilidad](vellumstyle-schema.md#garantía-de-retrocompatibilidad)
para lo que Vellum promete sobre los archivos que cargan hoy.
