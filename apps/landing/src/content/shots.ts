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

/**
 * The diagram area of the schematic window captures (T17, T18), without the
 * sidebar, the menu bar and the camera buttons.
 */
const SCHEMATIC_CROP = { left: 0.115, top: 0.03, right: 0.975, bottom: 0.985 };
const SCHEMATIC_RATIO =
  (3840 * (SCHEMATIC_CROP.right - SCHEMATIC_CROP.left)) /
  (2088 * (SCHEMATIC_CROP.bottom - SCHEMATIC_CROP.top));

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
    crop: SCHEMATIC_CROP,
    ratio: SCHEMATIC_RATIO,
    alt: {
      en: `The transit network of ${sc} in the schematic view: lines at 0°, 45° and 90° with their stations labelled`,
      es: `La red de tránsito de ${sc} en la vista esquemática: líneas a 0°, 45° y 90° con sus estaciones rotuladas`,
    },
    pending: { en: 'Schematic view · Day', es: 'Vista esquemática · Day' },
  },
  T18: {
    id: 'T18',
    file: 't18-esquematica-transit',
    priority: 'P1',
    city: SHOWCASE,
    // The same diagram area as T17.
    crop: SCHEMATIC_CROP,
    ratio: SCHEMATIC_RATIO,
    alt: {
      en: `The transit network of ${sc} in the schematic view on the dark Transit background: each line in its own colour, at 0°, 45° and 90°, with its stations labelled`,
      es: `La red de tránsito de ${sc} en la vista esquemática sobre el fondo oscuro de Transit: cada línea con su color, a 0°, 45° y 90°, y sus estaciones rotuladas`,
    },
    pending: {
      en: 'Schematic view · Transit',
      es: 'Vista esquemática · Transit',
    },
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
    version: '0.14.0',
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
    version: '0.14.0',
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
    version: '0.14.0',
    alt: {
      en: `The Export Map dialog over ${sc} in Day: PNG at 2× scale, white background and the marginalia preview`,
      es: `El diálogo Exportar mapa sobre ${sc} en Day: PNG a escala 2×, fondo blanco y la vista previa de la marginalia`,
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
    // Sebas's own city (the same save as T27), not a Workshop city.
    ratio: GUIDE_RATIO,
    perLanguage: true,
    version: '0.14.0',
    alt: {
      en: 'Vellum with Altavento open in Day: every layer on and the sidebar with the layer list and the map style',
      es: 'Vellum con Altavento abierta en Day: todas las capas encendidas y la barra lateral con la lista de capas y el estilo de mapa',
    },
    pending: {
      en: 'Guide · Vellum with a city open and the sidebar',
      es: 'Guía · Vellum con una ciudad abierta y la barra lateral',
    },
  },
  T32: {
    id: 'T32',
    file: 't32-manifiesto-a-sangre-day',
    priority: 'P1',
    // Sebas's own city, not a Workshop city: no credit.
    ratio: 2.2,
    alt: {
      en: 'A whole city in the Day theme: its streets and blocks in a clearing of the forest, a river to the north-west and a motorway passing to the west',
      es: 'Una ciudad entera en el tema Day: sus calles y manzanas en un claro del bosque, un río al noroeste y una autopista que pasa por el oeste',
    },
    pending: {
      en: 'Manifesto · a whole city in Day',
      es: 'Manifiesto · una ciudad entera en Day',
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

/**
 * One original snapshot of Los Santos Pobres in CSL Map View (the manifesto
 * strip; T33 in LISTA-DE-TOMAS.md, delivered). The files live in
 * `src/assets/lsp/`: `<file>.webp` is the strip print and `<file>-full.webp`,
 * when it exists, the uncropped original the lightbox opens.
 */
export interface LspPhoto {
  /** Snapshot number as printed in the caption (`05`, `14 · Bus`). */
  label: string;
  file: string;
  alt: Record<Lang, string>;
  /**
   * `true` while the alt is the neutral one: true, but not yet Sebas's line
   * about how the city grew (EXPERIENCE.md · Foto suelta). `shots:report`
   * lists them; launching needs Sebas's alts.
   */
  altPending: boolean;
}

/** Sebas's line per snapshot: how the city grew (2026-10-07). */
const LSP_ALTS: Record<string, Record<Lang, string>> = {
  '00': {
    en: 'Green land and lakes; only a few roads cross the map.',
    es: 'Terreno verde y lagos; solo unas pocas carreteras cruzan el mapa.',
  },
  '01': {
    en: 'The first street layout appears beside the lake.',
    es: 'Aparece el primer trazado de calles junto al lago.',
  },
  '02': {
    en: 'The first neighbourhood adds side streets around the shore.',
    es: 'El primer barrio suma calles secundarias alrededor de la orilla.',
  },
  '03': {
    en: 'A main road enters the neighbourhood and links it to the existing roads.',
    es: 'Una vía principal entra al barrio y conecta con las carreteras existentes.',
  },
  '04': {
    en: 'The lakeside neighbourhood grows into a fuller grid of streets.',
    es: 'El barrio junto al lago se amplía con una cuadrícula de calles más completa.',
  },
  '05': {
    en: 'A second cluster of streets emerges to the north-west, joined to the first neighbourhood by road.',
    es: 'Surge un segundo núcleo de calles al noroeste, unido al primer barrio por carretera.',
  },
  '06': {
    en: 'The first neighbourhood starts to fill with buildings and a small cluster appears to the south.',
    es: 'El primer barrio empieza a poblarse y aparece un pequeño núcleo al sur.',
  },
  '07': {
    en: 'Buildings spread in both clusters and the southern connections reach further.',
    es: 'Crecen las construcciones en ambos núcleos y se extienden las conexiones del sur.',
  },
  '08': {
    en: 'New streets are laid out to the east, along the chain of lakes.',
    es: 'Se trazan nuevas calles al este, junto al sistema de lagos.',
  },
  '09': {
    en: 'A third cluster to the north-west is connected to the original neighbourhood.',
    es: 'Un tercer núcleo al noroeste queda conectado con el barrio original.',
  },
  '11': {
    en: 'The city wraps around the lake and new neighbourhoods appear to the east and south-east.',
    es: 'La ciudad se extiende alrededor del lago y aparecen nuevos barrios al este y al sureste.',
  },
  '12': {
    en: 'A grid of streets is added to the eastern cluster.',
    es: 'Se añade una cuadrícula de calles en el núcleo oriental.',
  },
  '13': {
    en: 'The eastern cluster grows and connects better with the city and the main roads.',
    es: 'El núcleo oriental crece y se conecta mejor con la ciudad y las carreteras principales.',
  },
  '14': {
    en: 'The city now spans both shores of the lake; transport routes appear between its neighbourhoods.',
    es: 'La ciudad ya ocupa ambas orillas del lago; aparecen rutas de transporte entre sus barrios.',
  },
  '14 · Bus': {
    en: 'Bus routes run through the western neighbourhoods and the eastern cluster.',
    es: 'Rutas de autobús recorren los barrios del oeste y el núcleo oriental.',
  },
  '14 · Train': {
    en: 'Train lines link the neighbourhoods and stretch south and east.',
    es: 'Líneas de tren enlazan los barrios y se prolongan hacia el sur y el este.',
  },
  '15': {
    en: 'New streets and neighbourhoods extend the city to the south-east and south-west.',
    es: 'Nuevas calles y barrios amplían la ciudad hacia el sureste y el suroeste.',
  },
  '16': {
    en: 'The transport network grows denser in the eastern cluster, beside the lake.',
    es: 'La red de transporte se densifica en el núcleo oriental, junto al lago.',
  },
};

function lspPhoto(label: string, file: string): LspPhoto {
  const alt = LSP_ALTS[label];
  return {
    label,
    file,
    alt: alt ?? {
      en: `Los Santos Pobres, snapshot ${label}`,
      es: `Los Santos Pobres, snapshot ${label}`,
    },
    altPending: !alt,
  };
}

const LSP_NUMBERS = [
  '00',
  '01',
  '02',
  '03',
  '04',
  '05',
  '06',
  '07',
  '08',
  '09',
];
const LSP_LATER = ['11', '12', '13', '14', '15', '16'];

/** The strip in its order: 00–09, the gap of 10, then 11–16. */
export const LSP_STRIP = {
  before: LSP_NUMBERS.map((n) => lspPhoto(n, `lsp-${n}`)),
  /** Snapshot 10 was not kept: the strip shows its gap with real text. */
  missing: '10',
  after: LSP_LATER.map((n) => lspPhoto(n, `lsp-${n}`)),
};

/** The loose "14 · Bus" / "14 · Train" pair, in the margin. */
export const LSP_PAIR: LspPhoto[] = [
  lspPhoto('14 · Bus', 'lsp-14-bus'),
  lspPhoto('14 · Train', 'lsp-14-train'),
];
