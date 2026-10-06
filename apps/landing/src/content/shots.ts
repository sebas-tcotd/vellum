import type { Lang } from './routes';

/**
 * Registry of the home shots (LISTA-DE-TOMAS.md). A shot is `final` once its
 * file is in `src/assets/shots/`; until then it shows a `stand-in` (a render of
 * an earlier version, labelled with the shot id) or a visible `missing`
 * placeholder. `pnpm shots:report` lists what is still pending.
 */
export interface ShotEntry {
  /** Id in LISTA-DE-TOMAS.md (`T01`…). */
  id: string;
  /** File name Sebas delivers, without extension (`t01-hero-day-spring-valley`). */
  file: string;
  /** P1 is needed to launch; P2 can fall back. */
  priority: 'P1' | 'P2';
  /** Width / height the page frames the shot at. */
  ratio: number;
  /** What the final shot shows, for the alt text. */
  alt: Record<Lang, string>;
  /** Short description shown on the missing placeholder. */
  pending: Record<Lang, string>;
  /** Shots with UI text come as `<file>-en` and `<file>-es`. */
  perLanguage?: boolean;
  /** Earlier render shown meanwhile, from `src/assets/standins/`. */
  standIn?: { file: string; alt: Record<Lang, string> };
}

/** The showcase city of the shared master framing (T05–T19). */
export const SHOWCASE_CITY = 'Pepper Lake';

const sc = SHOWCASE_CITY;

/** Stand-ins that show exactly what the final shot will show. */
function same(file: string, alt: Record<Lang, string>) {
  return { file, alt };
}

export const SHOTS = {
  T01: {
    id: 'T01',
    file: 't01-hero-day-spring-valley',
    priority: 'P1',
    ratio: 2,
    alt: {
      en: 'Spring Valley in the Day theme: the whole city and its water on warm paper',
      es: 'Spring Valley en el tema Day: la ciudad entera y su agua sobre papel cálido',
    },
    pending: {
      en: 'Hero · Spring Valley, Day',
      es: 'Hero · Spring Valley, Day',
    },
    standIn: same('spring-valley-day-hero', {
      en: 'Spring Valley in the Day theme: the whole city and its water on warm paper',
      es: 'Spring Valley en el tema Day: la ciudad entera y su agua sobre papel cálido',
    }),
  },
  T02: {
    id: 'T02',
    file: 't02-galeria-island-hopping-day',
    priority: 'P1',
    ratio: 1.35,
    alt: {
      en: 'Island Hopping in the Day theme: a city spread across islands',
      es: 'Island Hopping en el tema Day: una ciudad repartida entre islas',
    },
    pending: { en: 'Gallery · Island Hopping', es: 'Galería · Island Hopping' },
    standIn: same('island-hopping-day-gallery', {
      en: 'Island Hopping in the Day theme: a city spread across islands',
      es: 'Island Hopping en el tema Day: una ciudad repartida entre islas',
    }),
  },
  T03: {
    id: 'T03',
    file: 't03-galeria-san-rico-day',
    priority: 'P1',
    ratio: 2.3,
    alt: {
      en: 'San Rico in the Day theme: islands, bridges and corridors',
      es: 'San Rico en el tema Day: islas, puentes y corredores',
    },
    pending: {
      en: 'Gallery · San Rico, detail',
      es: 'Galería · San Rico, detalle',
    },
    standIn: same('san-rico-day-gallery', {
      en: 'San Rico in the Day theme: islands, bridges and corridors',
      es: 'San Rico en el tema Day: islas, puentes y corredores',
    }),
  },
  T04: {
    id: 'T04',
    file: 't04-galeria-westdale-day',
    priority: 'P1',
    ratio: 2.3,
    alt: {
      en: 'Westdale in the Day theme: a dense coastal city',
      es: 'Westdale en el tema Day: una ciudad costera densa',
    },
    pending: {
      en: 'Gallery · Westdale, detail',
      es: 'Galería · Westdale, detalle',
    },
    standIn: same('westdale-day-gallery', {
      en: 'Westdale in the Day theme: a dense coastal city',
      es: 'Westdale en el tema Day: una ciudad costera densa',
    }),
  },
  T05: layerShot(
    'T05',
    't05-capas-1-terreno-agua',
    'pepper-lake-layer-01-terrain-water',
    {
      en: 'terrain and water only',
      es: 'solo terreno y agua',
    },
  ),
  T06: layerShot('T06', 't06-capas-2-vias', 'pepper-lake-layer-02-roads', {
    en: 'terrain, water and roads',
    es: 'terreno, agua y vías',
  }),
  T07: layerShot(
    'T07',
    't07-capas-3-edificios',
    'pepper-lake-layer-03-buildings',
    {
      en: 'roads and buildings added',
      es: 'con vías y edificios',
    },
  ),
  T08: layerShot('T08', 't08-capas-4-bosques', 'pepper-lake-layer-04-forests', {
    en: 'forests added',
    es: 'con bosques',
  }),
  T09: layerShot(
    'T09',
    't09-capas-5-distritos',
    'pepper-lake-layer-05-districts',
    {
      en: 'districts added',
      es: 'con distritos',
    },
  ),
  T10: layerShot('T10', 't10-capas-6-transito-todas', 'pepper-lake-theme-day', {
    en: 'every layer, transit lines included',
    es: 'todas las capas, con las líneas de tránsito',
  }),
  T11: themeShot(
    'T11',
    't11-tema-transit',
    'Transit',
    {
      en: 'the metro lines in colour over the dark city',
      es: 'las líneas de metro en color sobre la ciudad oscura',
    },
    'pepper-lake-theme-transit',
  ),
  T12: themeShot('T12', 't12-tema-classic', 'Classic', {
    en: 'the colours of the old CSL Map View',
    es: 'los colores del viejo CSL Map View',
  }),
  T13: themeShot('T13', 't13-tema-grayscale', 'Grayscale', {
    en: 'the city in shades of grey',
    es: 'la ciudad en escala de grises',
  }),
  T14: themeShot('T14', 't14-tema-grayscale-water', 'Grayscale + Water', {
    en: 'grey city, blue water',
    es: 'ciudad gris y agua azul',
  }),
  T15: {
    id: 'T15',
    file: 't15-nocturno-transit-atenuar',
    priority: 'P1',
    ratio: 2.2,
    alt: {
      en: `${sc} in Transit with "Dim other layers": the rest of the map fades over a dark background and only the lines stay in full colour`,
      es: `${sc} en Transit con «Atenuar otras capas»: el resto del mapa se atenúa sobre un fondo oscuro y solo las líneas siguen a todo color`,
    },
    pending: {
      en: 'Night · Transit, dimmed',
      es: 'Nocturno · Transit atenuado',
    },
    // Render of an earlier version: the dimmed layers washed to light grey.
    standIn: same('pepper-lake-theme-transit-dim', {
      en: `${sc} in Transit with "Dim other layers" in an earlier version: the rest of the map washed to light grey and the lines in full colour`,
      es: `${sc} en Transit con «Atenuar otras capas» en una versión anterior: el resto del mapa lavado a gris claro y las líneas a todo color`,
    }),
  },
  T16: {
    id: 'T16',
    file: 't16-nocturno-atenuar-sin-transito',
    priority: 'P2',
    ratio: 2.2,
    alt: { en: '', es: '' },
    pending: {
      en: 'Night · dimmed, no lines',
      es: 'Nocturno · atenuado sin líneas',
    },
  },
  T17: {
    id: 'T17',
    file: 't17-esquematica-day',
    priority: 'P1',
    ratio: 2.2,
    alt: {
      en: `The transit network of ${sc} in the schematic view: lines at 0°, 45° and 90° with their stations labelled`,
      es: `La red de tránsito de ${sc} en la vista esquemática: líneas a 0°, 45° y 90° con sus estaciones rotuladas`,
    },
    pending: { en: 'Schematic view · Day', es: 'Vista esquemática · Day' },
  },
  T19: {
    id: 'T19',
    file: 't19-distritos-calles-day',
    priority: 'P1',
    ratio: 1.2,
    alt: {
      en: `${sc} at neighbourhood zoom: named districts with their boundary and fill, and street names`,
      es: `${sc} a zoom de barrio: distritos con nombre, límite y relleno, y nombres de calle`,
    },
    pending: {
      en: 'Districts and street names',
      es: 'Distritos y nombres de calle',
    },
    standIn: same('pepper-lake-layer-05-districts', {
      en: `${sc} with its districts layer in the Day theme`,
      es: `${sc} con la capa de distritos en el tema Day`,
    }),
  },
  T20: {
    id: 'T20',
    file: 't20-modo-limpio-costa-tijuca',
    priority: 'P1',
    ratio: 16 / 9,
    alt: {
      en: 'Costa Tijuca full screen in clean mode: the map without any interface',
      es: 'Costa Tijuca a pantalla completa en modo limpio: el mapa sin interfaz',
    },
    pending: {
      en: 'Clean mode · Costa Tijuca',
      es: 'Modo limpio · Costa Tijuca',
    },
    standIn: same('costa-tijuca-day-gallery', {
      en: 'Costa Tijuca in the Day theme, the map without any interface',
      es: 'Costa Tijuca en el tema Day, el mapa sin interfaz',
    }),
  },
  T21: {
    id: 'T21',
    file: 't21-lamina-costa-tijuca-marginalia',
    priority: 'P1',
    ratio: 4 / 3,
    alt: {
      en: 'Costa Tijuca exported with its marginalia: city name, author, road and line legends, scale bar and north arrow',
      es: 'Costa Tijuca exportada con su marginalia: nombre de la ciudad, autor, leyendas de vías y líneas, escala gráfica y norte',
    },
    pending: {
      en: 'Print · export with marginalia',
      es: 'Lámina · export con marginalia',
    },
  },
  T22: shellShot('T22', 'windows', 'Windows'),
  T23: shellShot('T23', 'macos', 'macOS'),
  T24: shellShot('T24', 'linux', 'Linux'),
} satisfies Record<string, ShotEntry>;

export type ShotId = keyof typeof SHOTS;

function layerShot(
  id: string,
  file: string,
  standIn: string,
  what: Record<Lang, string>,
): ShotEntry {
  const alt = {
    en: `${sc} in the Day theme, ${what.en}`,
    es: `${sc} en el tema Day, ${what.es}`,
  };
  return {
    id,
    file,
    priority: 'P1',
    ratio: 2.2,
    alt,
    pending: { en: `Layers · ${what.en}`, es: `Capas · ${what.es}` },
    standIn: same(standIn, alt),
  };
}

function themeShot(
  id: string,
  file: string,
  theme: string,
  what: Record<Lang, string>,
  standIn?: string,
): ShotEntry {
  const alt = {
    en: `${sc} in the ${theme} theme: ${what.en}`,
    es: `${sc} en el tema ${theme}: ${what.es}`,
  };
  return {
    id,
    file,
    priority: 'P1',
    ratio: 2.2,
    alt,
    pending: { en: `Theme · ${theme}`, es: `Tema · ${theme}` },
    ...(standIn ? { standIn: same(standIn, alt) } : {}),
  };
}

function shellShot(id: string, os: string, name: string): ShotEntry {
  return {
    id,
    file: `${id.toLowerCase()}-shell-${os}`,
    priority: 'P1',
    ratio: 16 / 10,
    perLanguage: true,
    alt: {
      en: `Vellum on ${name} with the sidebar and a place card open`,
      es: `Vellum en ${name} con la barra lateral y una tarjeta de lugar abiertas`,
    },
    pending: { en: `Window · ${name}`, es: `Ventana · ${name}` },
  };
}
