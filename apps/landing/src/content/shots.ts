import type { CityId } from './cities';
import type { Lang } from './routes';

/**
 * Registry of the home and Guide shots (LISTA-DE-TOMAS.md). A shot is `final` once its
 * WebP is in `src/assets/shots/` (`scripts/import-shots.mjs` converts Sebas's
 * PNG originals); until then it shows a `stand-in` (a render of an earlier
 * version, labelled with the shot id) or a visible `missing` placeholder.
 * `pnpm shots:report` lists what is still pending.
 */
export interface ShotEntry {
  /** Id in LISTA-DE-TOMAS.md (`T01`…). */
  id: string;
  /** File name Sebas delivers, without extension (`t01-hero-day-spring-valley`). */
  file: string;
  /** P1 is needed to launch; P2 can fall back. */
  priority: 'P1' | 'P2';
  /** City shown, for captions and credits (window captures may show none). */
  city?: CityId;
  /** Width / height the page frames the shot at. */
  ratio: number;
  /** What the final shot shows, for the alt text. */
  alt: Record<Lang, string>;
  /** Short description shown on the missing placeholder. */
  pending: Record<Lang, string>;
  /** Shots with UI text come as `<file>-en` and `<file>-es`. */
  perLanguage?: boolean;
  /**
   * Area of the original kept when importing, as fractions of its size
   * (window captures whose interface is not part of the shot).
   */
  crop?: { left: number; top: number; right: number; bottom: number };
  /**
   * Colour laid under a semi-transparent export when importing (the dimmed
   * Transit exports come out translucent even with a dark background).
   */
  background?: string;
  /**
   * App version the final shot was taken with, shown in its caption (the
   * Guide: DESIGN.md · Paso de la Guía).
   */
  version?: string;
  /** Earlier render shown meanwhile, from `src/assets/standins/`. */
  standIn?: { file: string; alt: Record<Lang, string> };
}

/** A shot that shows a city, so its caption can credit it. */
type CityShot = ShotEntry & { city: CityId };

/** The showcase city of the shared master framing (T05–T16, T21). */
export const SHOWCASE: CityId = 'costaTijuca';
const sc = 'Costa Tijuca';

/** Background of the Transit theme (DESIGN.md · brand-transit). */
const TRANSIT_BACKGROUND = '#1A1A2E';

/** Ratio of the master framing A exports (5120 × 2700). */
const MASTER_RATIO = 5120 / 2700;

/** Window captures and game crops of the Guide (LISTA-DE-TOMAS.md · Guía). */
const GUIDE_RATIO = 16 / 9;

/**
 * T28 keeps a 16:9 area centred on the welcome of the 3840 × 2088 window
 * capture; the rest of the window is empty paper.
 */
const T28_WIDTH = 0.34;
const T28_HEIGHT = (3840 * T28_WIDTH * 9) / 16 / 2088;
const T28_CENTRE_Y = 0.517;

export const SHOTS = {
  T01: {
    id: 'T01',
    file: 't01-hero-day-spring-valley',
    priority: 'P1',
    city: 'springValley',
    ratio: 1.5,
    alt: {
      en: 'Spring Valley in the Day theme: the whole city and its water on warm paper',
      es: 'Spring Valley en el tema Day: la ciudad entera y su agua sobre papel cálido',
    },
    pending: {
      en: 'Hero · Spring Valley, Day',
      es: 'Hero · Spring Valley, Day',
    },
  },
  T02: {
    id: 'T02',
    file: 't02-galeria-island-hopping-day',
    priority: 'P1',
    city: 'islandHopping',
    ratio: 1.5,
    alt: {
      en: 'Island Hopping in the Day theme: a city spread across islands',
      es: 'Island Hopping en el tema Day: una ciudad repartida entre islas',
    },
    pending: { en: 'Gallery · Island Hopping', es: 'Galería · Island Hopping' },
  },
  T03: {
    id: 'T03',
    file: 't03-galeria-san-rico-day',
    priority: 'P1',
    city: 'sanRico',
    ratio: 2.3,
    alt: {
      en: 'San Rico in the Day theme: a motorway crossing dense neighbourhoods and woods',
      es: 'San Rico en el tema Day: una autopista que cruza barrios densos y bosques',
    },
    pending: {
      en: 'Gallery · San Rico, detail',
      es: 'Galería · San Rico, detalle',
    },
  },
  T04: {
    id: 'T04',
    file: 't04-galeria-westdale-day',
    priority: 'P1',
    city: 'westdale',
    ratio: 2.3,
    alt: {
      en: 'Westdale in the Day theme: a grid of streets meeting the coast',
      es: 'Westdale en el tema Day: una retícula de calles que llega a la costa',
    },
    pending: {
      en: 'Gallery · Westdale, detail',
      es: 'Galería · Westdale, detalle',
    },
  },
  T05: layerShot('T05', 't05-capas-1-terreno-agua', {
    en: 'terrain and water only',
    es: 'solo terreno y agua',
  }),
  T06: layerShot('T06', 't06-capas-2-vias', {
    en: 'terrain, water and roads',
    es: 'terreno, agua y vías',
  }),
  T07: layerShot('T07', 't07-capas-3-edificios', {
    en: 'roads and buildings added',
    es: 'con vías y edificios',
  }),
  T08: layerShot('T08', 't08-capas-4-bosques', {
    en: 'forests added',
    es: 'con bosques',
  }),
  T09: layerShot('T09', 't09-capas-5-distritos', {
    en: 'districts added',
    es: 'con distritos',
  }),
  T10: layerShot('T10', 't10-capas-6-transito-todas', {
    en: 'every layer, transit lines included',
    es: 'todas las capas, con las líneas de tránsito',
  }),
  T11: themeShot('T11', 't11-tema-transit', 'Transit', {
    en: 'the transit lines in colour over the dark city',
    es: 'las líneas de tránsito en color sobre la ciudad oscura',
  }),
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
    city: SHOWCASE,
    ratio: MASTER_RATIO,
    background: TRANSIT_BACKGROUND,
    alt: {
      en: `${sc} in Transit with "Dim other layers": the rest of the map fades over a dark background and only the lines stay in full colour`,
      es: `${sc} en Transit con «Atenuar otras capas»: el resto del mapa se atenúa sobre un fondo oscuro y solo las líneas siguen a todo color`,
    },
    pending: {
      en: 'Night · Transit, dimmed',
      es: 'Nocturno · Transit atenuado',
    },
  },
  T16: {
    id: 'T16',
    file: 't16-nocturno-atenuar-sin-transito',
    priority: 'P2',
    city: SHOWCASE,
    ratio: MASTER_RATIO,
    background: TRANSIT_BACKGROUND,
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
    city: SHOWCASE,
    // The diagram area of the window capture, without the sidebar, the menu
    // bar and the camera buttons.
    crop: { left: 0.115, top: 0.03, right: 0.975, bottom: 0.985 },
    ratio: (3840 * (0.975 - 0.115)) / (2088 * (0.985 - 0.03)),
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
    city: 'pepperLake',
    ratio: 3840 / 2025,
    alt: {
      en: 'Pepper Lake at neighbourhood zoom: named districts with their boundary and fill, and street names',
      es: 'Pepper Lake a zoom de barrio: distritos con nombre, límite y relleno, y nombres de calle',
    },
    pending: {
      en: 'Districts and street names',
      es: 'Distritos y nombres de calle',
    },
  },
  T20: {
    id: 'T20',
    file: 't20-modo-limpio-costa-tijuca',
    priority: 'P1',
    city: 'costaTijuca',
    ratio: 16 / 9,
    alt: {
      en: 'Costa Tijuca full screen in clean mode: the map without any interface',
      es: 'Costa Tijuca a pantalla completa en modo limpio: el mapa sin interfaz',
    },
    pending: {
      en: 'Clean mode · Costa Tijuca',
      es: 'Modo limpio · Costa Tijuca',
    },
  },
  T21: {
    id: 'T21',
    file: 't21-lamina-costa-tijuca-marginalia',
    priority: 'P1',
    city: 'costaTijuca',
    ratio: MASTER_RATIO,
    alt: {
      en: 'Costa Tijuca exported with its marginalia in the bottom left corner: city name, author, road and line legends, scale bar and north arrow',
      es: 'Costa Tijuca exportada con su marginalia abajo a la izquierda: nombre de la ciudad, autor, leyendas de vías y líneas, escala gráfica y norte',
    },
    pending: {
      en: 'Print · export with marginalia',
      es: 'Lámina · export con marginalia',
    },
  },
  T22: shellShot('T22', 'windows', 'Windows'),
  T23: shellShot('T23', 'macos', 'macOS'),
  T24: shellShot('T24', 'linux', 'Linux'),
  T25: {
    id: 'T25',
    file: 't25-guia-instalador-nsis',
    priority: 'P2',
    ratio: GUIDE_RATIO,
    alt: {
      en: 'The first screen of the Vellum installer on Windows',
      es: 'La primera pantalla del instalador de Vellum en Windows',
    },
    pending: {
      en: 'Guide · the Vellum installer on Windows',
      es: 'Guía · el instalador de Vellum en Windows',
    },
  },
  T26: {
    id: 'T26',
    file: 't26-guia-bridge-gestor-contenido',
    priority: 'P1',
    ratio: GUIDE_RATIO,
    perLanguage: true,
    alt: {
      en: 'Cities: Skylines, Content Manager → Mods: Vellum Bridge in the list, enabled',
      es: 'Cities: Skylines, Gestor de contenido → Mods: Vellum Bridge en la lista, activado',
    },
    pending: {
      en: 'Guide · Vellum Bridge enabled in Content Manager',
      es: 'Guía · Vellum Bridge activado en el Gestor de contenido',
    },
  },
  T27: {
    id: 'T27',
    file: 't27-guia-bridge-resultado',
    priority: 'P2',
    ratio: GUIDE_RATIO,
    perLanguage: true,
    alt: {
      en: 'The window Bridge shows in the game when the export is done, with the path of the file',
      es: 'La ventana que Bridge muestra en el juego al terminar la exportación, con la ruta del archivo',
    },
    pending: {
      en: 'Guide · Bridge shows where it saved the file',
      es: 'Guía · Bridge muestra dónde guardó el archivo',
    },
  },
  T28: {
    id: 'T28',
    file: 't28-guia-bienvenida',
    priority: 'P1',
    ratio: GUIDE_RATIO,
    perLanguage: true,
    version: '0.14.0',
    crop: {
      left: 0.5 - T28_WIDTH / 2,
      top: T28_CENTRE_Y - T28_HEIGHT / 2,
      right: 0.5 + T28_WIDTH / 2,
      bottom: T28_CENTRE_Y + T28_HEIGHT / 2,
    },
    alt: {
      en: 'The Vellum welcome with no city open: “Drop your city (.vellummap or .cslmap) here”, “or press Ctrl + O” and the Open file button',
      es: 'La bienvenida de Vellum sin ninguna ciudad abierta: «Arrastra tu ciudad (.vellummap o .cslmap) aquí», «o presiona Ctrl + O» y el botón Abrir archivo',
    },
    pending: {
      en: 'Guide · the Vellum welcome',
      es: 'Guía · la bienvenida de Vellum',
    },
  },
  T29: {
    id: 'T29',
    file: 't29-guia-dialogo-exportar',
    priority: 'P1',
    city: SHOWCASE,
    ratio: GUIDE_RATIO,
    perLanguage: true,
    alt: {
      en: `The Export Map dialog over ${sc} in Day: PNG at 4× scale, white background and the marginalia preview`,
      es: `El diálogo Exportar mapa sobre ${sc} en Day: PNG a escala 4×, fondo blanco y la vista previa de la marginalia`,
    },
    pending: {
      en: 'Guide · the Export Map dialog with marginalia',
      es: 'Guía · el diálogo Exportar mapa con marginalia',
    },
  },
  T30: {
    id: 'T30',
    file: 't30-ventana-vellum-day',
    priority: 'P1',
    city: SHOWCASE,
    ratio: GUIDE_RATIO,
    perLanguage: true,
    alt: {
      en: `Vellum with ${sc} open in Day: every layer on and the sidebar with the layer list and the map style`,
      es: `Vellum con ${sc} abierta en Day: todas las capas encendidas y la barra lateral con la lista de capas y el estilo de mapa`,
    },
    pending: {
      en: 'Guide · Vellum with a city open and the sidebar',
      es: 'Guía · Vellum con una ciudad abierta y la barra lateral',
    },
  },
} satisfies Record<string, ShotEntry>;

export type ShotId = keyof typeof SHOTS;

function layerShot(
  id: string,
  file: string,
  what: Record<Lang, string>,
): CityShot {
  return {
    id,
    file,
    priority: 'P1',
    city: SHOWCASE,
    ratio: MASTER_RATIO,
    alt: {
      en: `${sc} in the Day theme, ${what.en}`,
      es: `${sc} en el tema Day, ${what.es}`,
    },
    pending: { en: `Layers · ${what.en}`, es: `Capas · ${what.es}` },
  };
}

function themeShot(
  id: string,
  file: string,
  theme: string,
  what: Record<Lang, string>,
): CityShot {
  return {
    id,
    file,
    priority: 'P1',
    city: SHOWCASE,
    ratio: MASTER_RATIO,
    alt: {
      en: `${sc} in the ${theme} theme: ${what.en}`,
      es: `${sc} en el tema ${theme}: ${what.es}`,
    },
    pending: { en: `Theme · ${theme}`, es: `Tema · ${theme}` },
  };
}

function shellShot(id: string, os: string, name: string): CityShot {
  return {
    id,
    file: `${id.toLowerCase()}-shell-${os}`,
    priority: 'P1',
    city: 'pepperLake',
    ratio: 1.5,
    perLanguage: true,
    alt: {
      en: `Vellum on ${name} with Pepper Lake, the sidebar and a place card open`,
      es: `Vellum en ${name} con Pepper Lake, la barra lateral y una tarjeta de lugar abiertas`,
    },
    pending: { en: `Window · ${name}`, es: `Ventana · ${name}` },
  };
}
