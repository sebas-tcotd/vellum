import { DEFAULT_RENDER_STYLE_PARAMS } from './default-style';
import { HEX_COLOR_PATTERN, HSL_COLOR_PATTERN } from './validators/color';

/**
 * Canonical, stable `$id` of the published `.vellumstyle` JSON Schema.
 * @remarks
 * Theme authors put this URL in their file's `"$schema"` property to get editor
 * autocompletion. Vellum itself never requires `"$schema"` to load a file.
 */
export const VELLUMSTYLE_SCHEMA_ID =
  'https://raw.githubusercontent.com/sebas-tcotd/vellum/main/packages/theme-engine/vellumstyle.schema.json';

/** Dialect the emitted schema declares. */
const JSON_SCHEMA_DIALECT = 'https://json-schema.org/draft/2020-12/schema';

/** A JSON Schema subschema — kept as a loose record because the tree is emitted, not typed. */
export type JsonSchemaNode = Record<string, unknown>;

/**
 * Rewrites a regex source so its literal ASCII letters match case-insensitively.
 * @remarks
 * JSON Schema's `pattern` keyword takes no regex flags, so the `i` flag on
 * {@link HSL_COLOR_PATTERN} cannot survive as-is. Las secuencias escapadas (`\s`, `\d`, …)
 * se copian tal cual para preservar su significado; solo las letras sin escapar se expanden
 * a una clase de dos caracteres.
 *
 * Una clase de caracteres se copia entera y sin tocar, porque expandir una letra *dentro*
 * de `[...]` produciría basura: `[0-9a-fA-F]` se volvería `[0-9[aA]-[fF]]`, que ya no es la
 * clase que era. Copiarla tal cual solo es correcto si la clase no trae letras
 * (`[,\s]` y `[,\s/]` de {@link HSL_COLOR_PATTERN} no traen), así que una clase **con**
 * letras se rechaza en vez de perder la insensibilidad a mayúsculas en silencio — que es
 * justo lo que pasaría si alguien enrutara {@link HEX_COLOR_PATTERN} por aquí.
 * @param source - A regex `source` string.
 * @returns An equivalent source that no longer depends on the `i` flag.
 * @throws Si `source` trae una clase de caracteres con letras dentro, o una sin cerrar.
 * @internal Exportada solo para poder testearla directamente.
 */
export function caseFoldLiterals(source: string): string {
  let out = '';
  for (let i = 0; i < source.length; i++) {
    const char = source[i] as string;
    if (char === '\\') {
      out += char + (source[i + 1] ?? '');
      i++;
      continue;
    }
    if (char === '[') {
      const end = indexOfClassEnd(source, i);
      const klass = source.slice(i, end + 1);
      // Las secuencias escapadas (`\s`, `\d`) traen letras que no son literales: fuera
      // antes de buscar.
      if (/[a-zA-Z]/.test(klass.replace(/\\./g, ''))) {
        throw new Error(
          `caseFoldLiterals no puede plegar mayúsculas dentro de una clase de caracteres con letras (${klass}) en: ${source}`,
        );
      }
      out += klass;
      i = end;
      continue;
    }
    if (/[a-zA-Z]/.test(char)) {
      out += `[${char.toLowerCase()}${char.toUpperCase()}]`;
      continue;
    }
    out += char;
  }
  return out;
}

/**
 * Devuelve el índice del `]` que cierra la clase abierta en `start`.
 * @param source - El source completo.
 * @param start - Índice del `[` de apertura.
 * @returns El índice del `]` de cierre.
 * @throws Si la clase no se cierra.
 */
function indexOfClassEnd(source: string, start: number): number {
  for (let i = start + 1; i < source.length; i++) {
    if (source[i] === '\\') {
      i++;
      continue;
    }
    if (source[i] === ']') return i;
  }
  throw new Error(`clase de caracteres sin cerrar en: ${source}`);
}

/**
 * Strips the leading `^` and trailing `$` anchors so two sources can be alternated.
 * @remarks
 * El lookbehind es lo que distingue el ancla `$` de un `\$` literal: sin él, un patrón
 * terminado en `\$` perdería el `$` y dejaría la barra invertida colgando, escapando por
 * accidente al carácter siguiente cuando las dos fuentes se concatenan.
 * @param source - A regex `source` string.
 * @returns The same source without its outer anchors.
 * @internal Exportada solo para poder testearla directamente.
 */
export function unanchor(source: string): string {
  return source.replace(/^\^/, '').replace(/(?<!\\)\$$/, '');
}

/**
 * The JSON Schema `pattern` accepting any valid `ColorToken`, derived from the runtime
 * validator's own regexes so the two can never drift apart.
 */
export const COLOR_TOKEN_PATTERN = `^(?:${unanchor(HEX_COLOR_PATTERN.source)}|${caseFoldLiterals(
  unanchor(HSL_COLOR_PATTERN.source),
)})$`;

/** JSON Pointer to the shared `ColorToken` definition every color leaf references. */
const COLOR_TOKEN_REF = '#/$defs/colorToken';

/** Subschema for a single `ColorToken` leaf — a `$ref` so the grammar appears exactly once. */
function colorTokenNode(value: string): JsonSchemaNode {
  return { $ref: COLOR_TOKEN_REF, default: value };
}

/**
 * Claves de la raíz que el schema define por su cuenta y que un grupo de estilo no puede
 * pisar.
 * @remarks
 * `buildVellumStyleSchema()` esparce las propiedades derivadas *después* de estas tres, así
 * que una colisión no daría error: sobrescribiría en silencio la definición buena — `name`
 * perdería su `minLength: 1` y pasaría a ser un objeto de colores.
 */
const RESERVED_ROOT_KEYS = new Set(['name', 'schemaVersion', '$schema']);

/**
 * Converts one node of the canonical template into its JSON Schema subschema.
 * @remarks
 * String leaves in `DEFAULT_RENDER_STYLE_PARAMS` are color tokens; numeric leaves are
 * plain numbers (`grid.opacity`, `grid.width`); arrays are homogeneous number arrays
 * (`grid.dasharray`). Objects require every key they declare — matching the runtime
 * validator, which demands each leaf of a provided group — but never set
 * `additionalProperties: false`: unknown fields are the documented extension point.
 *
 * Cada hoja lleva además el `default` del template: el valor ya está en la mano y es lo que
 * el editor ofrece al autor cuando completa un grupo a medias.
 * @param template - The node of the canonical shape being described.
 * @param path - Ruta punteada del nodo, solo para el mensaje de error.
 * @returns The JSON Schema subschema for that node.
 * @throws Si el template trae un nodo que este builder no sabe describir. Lanzar es
 * deliberado: devolver `{}` aceptaría cualquier cosa en silencio, y el test de drift no lo
 * vería porque compara el builder consigo mismo.
 */
function nodeToSchema(template: unknown, path: string): JsonSchemaNode {
  if (typeof template === 'string') return colorTokenNode(template);
  if (typeof template === 'number')
    return { type: 'number', default: template };
  if (Array.isArray(template)) {
    const first = template[0];
    if (first === undefined) {
      throw new Error(
        `nodeToSchema no puede describir un arreglo vacío del template en "${path}": no hay elemento del que derivar \`items\`.`,
      );
    }
    return {
      type: 'array',
      items: nodeToSchema(first, `${path}[0]`),
      default: template,
    };
  }
  if (typeof template === 'object' && template !== null) {
    const record = template as Record<string, unknown>;
    const properties: Record<string, JsonSchemaNode> = {};
    for (const key of Object.keys(record)) {
      properties[key] = nodeToSchema(
        record[key],
        path ? `${path}.${key}` : key,
      );
    }
    return {
      type: 'object',
      properties,
      required: Object.keys(record),
    };
  }
  throw new Error(
    `nodeToSchema no sabe describir el nodo "${path}" del template (${
      template === null ? 'null' : typeof template
    }). Amplía el builder en vez de dejar que el schema acepte cualquier cosa ahí.`,
  );
}

/**
 * Derives the published `.vellumstyle` JSON Schema (2020-12) from
 * `DEFAULT_RENDER_STYLE_PARAMS`.
 * @remarks
 * Deriving rather than hand-maintaining is the anti-drift guarantee: the schema, the
 * runtime validator and the default palette all read from the same object. The emitted
 * artifact lives at `packages/theme-engine/vellumstyle.schema.json`; re-emit it with
 * `pnpm --filter @vellum/theme-engine schema:emit` after touching the palette shape or the
 * color grammars.
 *
 * Root-level style keys (`terrain`, `roads`, …) are **optional** because `migrateTheme()`
 * fills any missing group from the defaults; only `name` is required. `$schema` and
 * `schemaVersion` are optional too.
 * @returns A plain JSON-serializable JSON Schema document.
 * @example
 * ```ts
 * const schema = buildVellumStyleSchema();
 * schema.$id; // → the published raw.githubusercontent.com URL
 * ```
 */
export function buildVellumStyleSchema(): JsonSchemaNode {
  const styleProperties: Record<string, JsonSchemaNode> = {};
  for (const key of Object.keys(DEFAULT_RENDER_STYLE_PARAMS)) {
    if (RESERVED_ROOT_KEYS.has(key)) {
      throw new Error(
        `La clave de estilo "${key}" choca con una clave reservada de la raíz del schema (${[
          ...RESERVED_ROOT_KEYS,
        ].join(
          ', ',
        )}). Renómbrala en DEFAULT_RENDER_STYLE_PARAMS: el spread la sobrescribiría en silencio.`,
      );
    }
    styleProperties[key] = nodeToSchema(
      (DEFAULT_RENDER_STYLE_PARAMS as unknown as Record<string, unknown>)[key],
      key,
    );
  }
  return {
    $schema: JSON_SCHEMA_DIALECT,
    $id: VELLUMSTYLE_SCHEMA_ID,
    title: 'Vellum .vellumstyle theme',
    description:
      'Color palette contract for a Vellum `.vellumstyle` theme file. Unknown properties are allowed at every level — they are the documented extension point and are ignored by Vellum.',
    type: 'object',
    $defs: {
      colorToken: {
        title: 'ColorToken',
        description:
          'A hex color (`#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`) or a CSS `hsl(...)` string. No other color format is accepted.',
        type: 'string',
        pattern: COLOR_TOKEN_PATTERN,
      },
    },
    properties: {
      $schema: {
        type: 'string',
        description:
          'Optional. Points an editor at this schema for autocompletion; Vellum never requires it.',
      },
      schemaVersion: {
        type: 'integer',
        minimum: 1,
        description:
          'Optional. Contract version of the file; defaults to 1 when omitted.',
      },
      name: {
        type: 'string',
        minLength: 1,
        description: 'Display name shown on the theme selector pill.',
      },
      ...styleProperties,
    },
    required: ['name'],
  };
}
