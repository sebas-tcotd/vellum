import type { Lang } from './routes';

/**
 * Copy of the home (EXPERIENCE.md · Páginas · Home). Spanish follows home-2
 * as corrected by the spines; English is an adaptation, not a calque, and is
 * pending Sebas's review.
 */
export interface HomeCopy {
  meta: { title: string; description: string };
  hero: {
    eyebrow: string;
    title: string;
    lede: string;
    cta: string;
    bridge: string;
    fine: string;
    credit: string;
  };
  gallery: Section & {
    captions: { islandHopping: string; sanRico: string; westdale: string };
    open: string;
  };
  layers: Section & {
    names: [string, string, string, string, string, string];
    stripLabel: string;
    allCaption: string;
    panelCaption: string;
    panelNote: string;
  };
  themes: Section & {
    left: string;
    right: string;
    leftShort: string;
    rightShort: string;
    localized: Record<ThemeId, string>;
    inherited: string;
    compare: string;
    divider: string;
    swapped: string;
    schemaLink: string;
    unavailable: string;
  };
  nocturno: Section & {
    toggle: string;
    toggleNote: string;
    figureCaption: string;
    caption: string;
    dimmedCaption: string;
  };
  schematic: Section & {
    cells: { key: string; title: string; body: string }[];
    caption: string;
  };
  districts: Section & {
    caption: string;
    cardCaption: string;
    cardDescription: string;
  };
  creators: Section & {
    frame: string;
    caption: string;
    cards: { key: string; title: string; body: string }[];
  };
  plate: Section & {
    cartelTitle: string;
    cartelMeta: string;
    rows: { key: string; value: string }[];
    footnote: string;
  };
  shells: Section & {
    cards: { title: string; material: string }[];
  };
  download: {
    eyebrow: string;
    title: string;
    fallbackTitle: string;
    lede: string;
    platformsLabel: string;
    recommended: string;
    allDownloads: string;
    storeAlt: string;
    formats: Record<string, string>;
    platformKeys: Record<'windows' | 'macos' | 'linux', string>;
    bridge: {
      eyebrow: string;
      title: string;
      bodyStrong: string;
      body: string;
      link: string;
    };
    cslmap: string;
  };
  pendingAuthor: string;
  pendingUrl: string;
  pendingShot: string;
  standIn: string;
  workshop: string;
}

export type ThemeId =
  | 'day'
  | 'transit'
  | 'classic'
  | 'grayscale'
  | 'grayscaleWater';

/** A home section: eyebrow, H2, lead paragraph(s) and margin note. */
interface Section {
  eyebrow: string;
  title: string;
  body: string[];
  note: string;
}

export const THEME_NAMES: Record<ThemeId, string> = {
  day: 'Day',
  transit: 'Transit',
  classic: 'Classic',
  grayscale: 'Grayscale',
  grayscaleWater: 'Grayscale + Water',
};

export const HOME: Record<Lang, HomeCopy> = {
  es: {
    meta: {
      title: 'Vellum · Un mapa para la ciudad que construiste',
      description:
        'Vellum convierte tu ciudad de Cities: Skylines en un mapa que puedes recorrer, leer y guardar: capas, temas, vista esquemática y exportación con marginalia.',
    },
    hero: {
      eyebrow: 'Mapas de tus ciudades de Cities: Skylines · versión 1.0',
      title: 'Un mapa para la ciudad que construiste.',
      lede: 'Cada avenida que trazaste, cada barrio que creció junto al río. Vellum convierte tu partida en un mapa que puedes recorrer, leer y guardar, y que da ganas de volver al juego a seguir construyendo.',
      cta: 'Descargar Vellum',
      bridge: 'Y en el juego: Vellum Bridge',
      fine: 'Gratis y de código abierto · Windows, macOS y Linux · también en Microsoft Store',
      credit: 'tema Day',
    },
    gallery: {
      eyebrow: '02 · Mapas reales',
      title: 'Ciudades de verdad, de gente que juega.',
      body: [
        'Así se ven partidas reales al abrirlas en Vellum: costas, islas, puentes y avenidas que alguien levantó a mano, tramo a tramo.',
      ],
      note: 'Ciudades de otros jugadores, con su crédito y su enlace. La tuya podría ser la siguiente.',
      captions: {
        islandHopping: 'Tema Day · una ciudad extendida sobre el agua',
        sanRico: 'Tema Day · islas, puentes y corredores',
        westdale: 'Atlantic Keys · tema Day',
      },
      open: 'Ver {city} en grande',
    },
    layers: {
      eyebrow: '03 · Capa a capa',
      title: 'Enciende solo lo que cuenta tu historia.',
      body: [
        'Terreno, mapa base, vías, edificios, bosques, distritos y tránsito. Empieza por el agua y ve sumando hasta que la ciudad se lea sola. Y cuando una capa te pida más, ábrela: cada capa tiene su propio panel de opciones.',
      ],
      note: '1…7 enciende y apaga cada capa sin tocar el panel; Shift + 1…7 abre sus opciones.',
      names: [
        'Terreno y agua',
        'Vías',
        'Edificios',
        'Bosques',
        'Distritos',
        'Tránsito',
      ],
      stripLabel: 'Capas',
      allCaption: '{city} · tema Day',
      panelCaption: 'Opciones de la capa Vías: el panel real de la app',
      panelNote:
        'En otras capas: relieve hipsométrico y curvas de nivel, edificios por zona, bosques en círculos o como mapa de calor, relleno de distritos.',
    },
    themes: {
      eyebrow: '04 · Temas',
      title: 'La misma ciudad, a otra hora.',
      body: [
        'Cinco temas incluidos. Day, el papel de siempre; Transit, para leer el transporte; y tres heredados de CSL Map View para quien echaba de menos su mapa de antes. ¿Ninguno es el tuyo?',
      ],
      note: 'Classic y Grayscale vienen del viejo CSL Map View: si llegas desde allí, estás en casa.',
      left: 'Lado izquierdo',
      right: 'Lado derecho',
      leftShort: 'Izq.',
      rightShort: 'Der.',
      localized: {
        day: 'Día',
        transit: 'Tránsito',
        classic: 'Clásico',
        grayscale: 'Escala de grises',
        grayscaleWater: 'Grises + Agua',
      },
      inherited: 'heredados de CSL Map View',
      compare: '{city} · arrastra para comparar',
      divider: 'Divisor de comparación',
      swapped: 'Comparando {left} con {right}',
      schemaLink: 'Crea tu .vellumstyle: el esquema es público',
      unavailable: 'Toma pendiente',
    },
    nocturno: {
      eyebrow: '05 · Nocturno',
      title: 'Luces apagadas.',
      body: [
        'Con el tema Transit, la ciudad se apaga y quedan las líneas, con el color que les diste en el juego. Y si activas «Atenuar otras capas», el resto del mapa se atenúa sobre un fondo oscuro y solo tus líneas siguen a todo color.',
      ],
      note: 'Para mirar solo el transporte, como desde un avión de noche.',
      toggle: 'Atenuar otras capas',
      toggleNote: 'opción del tema Transit',
      figureCaption: 'Así se ve el ajuste en la app',
      caption: '{city} · Transit',
      dimmedCaption: '+ atenuar otras capas',
    },
    schematic: {
      eyebrow: '06 · Vista esquemática',
      title: 'Tu red, dibujada como un plano de metro.',
      body: [
        'Abre la vista esquemática y Vellum redibuja todas tus líneas en ángulos de 45°, como los planos que se cuelgan en los andenes. La maraña de la ciudad se vuelve un diagrama que se entiende de un vistazo, con tus estaciones y tus colores.',
      ],
      note: 'Basada en los trabajos de Bast y Brosi (Universidad de Friburgo) sobre mapas de transporte: LOOM y octi.',
      cells: [
        {
          key: 'Octilineal',
          title: 'Solo 0°, 45° y 90°',
          body: 'Cada tramo se acomoda a la grilla, con los giros en las estaciones.',
        },
        {
          key: 'Estaciones',
          title: 'Un nodo por estación',
          body: 'Los andenes de una misma estación se contraen en uno, con prioridad a los rieles.',
        },
        {
          key: 'Etiquetas',
          title: 'Nombres que no se pisan',
          body: 'Los paraderos se rotulan sin chocar entre sí. Pulsa uno y abre su ficha.',
        },
        {
          key: 'Cámara',
          title: 'Se mueve como el mapa',
          body: 'Zoom y desplazamiento fluidos, igual que en la vista geográfica.',
        },
      ],
      caption: '{city} · vista esquemática · tema Day',
    },
    districts: {
      eyebrow: '07 · Distritos y lugares',
      title: 'Pregúntale al mapa qué hay ahí.',
      body: [
        'Tus barrios aparecen con su nombre, su límite y un relleno según su especialización; si prefieres, como marcadores. Con una ciudad exportada por Vellum Bridge, las calles también llevan su nombre.',
        'Pulsa un distrito, un parque o un edificio y se abre su tarjeta: población, hogares, empleos y especializaciones.',
      ],
      note: 'Los nombres son los que tú les pusiste en el juego. Los de calles llegan con Vellum Bridge.',
      caption: '{city} · distritos y calles · tema Day',
      cardCaption: 'La tarjeta de lugar real de la app, con datos de ejemplo',
      cardDescription:
        'Tarjeta del distrito de ejemplo Harbor Heights: población, superficie, tipo y una barra con hogares y empleos por sector.',
    },
    creators: {
      eyebrow: '08 · Para quien cuenta su ciudad',
      title: 'Explica tu ciudad sin perderte en la cámara.',
      body: [],
      note: 'Para el video de la semana, el directo del domingo o el post en Reddit.',
      frame: 'tu video · escena 3 · «el nuevo distrito del puerto»',
      caption: 'Costa Tijuca · modo limpio (H): el mapa sin interfaz',
      cards: [
        {
          key: 'En el video',
          title: 'Un mapa que se entiende en dos segundos',
          body: 'Muestra dónde está cada zona y qué estás construyendo. Exporta en PNG hasta 4× o en SVG para editarlo.',
        },
        {
          key: 'En directo',
          title: 'Vellum en otra pantalla',
          body: 'Déjalo abierto mientras juegas. Con H escondes la interfaz y queda solo el mapa.',
        },
        {
          key: 'Para compartir',
          title: 'Tu nombre en la esquina',
          body: 'Fondo blanco, oscuro o transparente, y tu nombre en la marginalia del mapa. Listo para Reddit, Steam o la miniatura del video.',
        },
      ],
    },
    plate: {
      eyebrow: '09 · Lámina',
      title: 'Así se vería tu mapa impreso.',
      body: [
        'Cuando exportas, Vellum puede añadir la marginalia de una carta de verdad: el nombre de tu ciudad, tu nombre, la leyenda de vías y de líneas, la escala gráfica y el norte. Exporta en PNG a 4× y llévalo a imprimir.',
      ],
      note: 'El panel de marginalia sale en el PNG y en el SVG, en la esquina que elijas.',
      cartelTitle: 'Costa Tijuca',
      cartelMeta: 'Tema Day · PNG 4× · marginalia abajo a la izquierda',
      rows: [
        { key: 'Identidad', value: 'nombre de la ciudad · autor' },
        {
          key: 'Leyendas',
          value: 'jerarquía vial · líneas y modos de transporte · elevación',
        },
        { key: 'Ayudas', value: 'escala gráfica · orientación' },
        {
          key: 'Información',
          value: 'resumen cartográfico · fuente y límites de los datos',
        },
        { key: 'Esquina', value: 'cualquiera de las cuatro' },
        { key: 'Fondo', value: 'blanco · oscuro · transparente' },
      ],
      footnote:
        'Lo que se ve en el panel es lo que exporta la app (DM Mono, colores del tema). Los textos cambian con cada ciudad.',
    },
    shells: {
      eyebrow: '10 · En tu sistema',
      title: 'En casa en cada escritorio.',
      body: ['El mapa es el mismo; la ventana se adapta a tu sistema.'],
      note: 'No es la misma ventana en todas partes: Vellum toma los materiales de cada sistema.',
      cards: [
        { title: 'Así se ve en Windows', material: 'Mica y Acrylic' },
        { title: 'Así se ve en macOS', material: 'Liquid Glass' },
        { title: 'Así se ve en Linux', material: 'papel por defecto' },
      ],
    },
    download: {
      eyebrow: '11 · Descarga',
      title: 'Tu ciudad te está esperando.',
      fallbackTitle: 'Descarga Vellum desde GitHub Releases',
      lede: 'Gratis y de código abierto. Elige tu sistema y en un par de minutos estás mirando tu mapa.',
      platformsLabel: 'Descargas por sistema',
      recommended: 'Recomendado para tu sistema',
      allDownloads: 'Todas las descargas en GitHub Releases',
      storeAlt: 'Obtenlo de Microsoft',
      formats: {
        exe: 'Instalador .exe',
        dmg: 'Imagen de disco .dmg',
        deb: '.deb · Debian y Ubuntu',
        AppImage: '.AppImage · otras distribuciones',
        rpm: '.rpm · Fedora y openSUSE',
      },
      platformKeys: {
        windows: 'Windows 10 1809 o posterior · x64',
        macos: 'Universal · Apple Silicon e Intel',
        linux: 'x86_64',
      },
      bridge: {
        eyebrow: 'Y en el juego',
        title: 'Vellum Bridge',
        bodyStrong: 'Sin Bridge, Vellum no tiene nada que dibujar.',
        body: 'Es el mod que exporta tu ciudad desde Cities: Skylines con un botón o con Ctrl + Shift + E. Sin conexión, solo lectura.',
        link: 'Obtener Vellum Bridge en Steam Workshop',
      },
      cslmap:
        '¿Vienes de CSL Map View? Vellum también abre tus archivos .cslmap.',
    },
    pendingAuthor: 'autor pendiente',
    pendingUrl: 'URL pendiente',
    pendingShot: 'Toma pendiente',
    standIn: 'provisional',
    workshop: 'Steam Workshop',
  },
  en: {
    meta: {
      title: 'Vellum · A map for the city you built',
      description:
        'Vellum turns your Cities: Skylines city into a map you can explore, read and keep: layers, themes, a schematic view and exports with marginalia.',
    },
    hero: {
      eyebrow: 'Maps of your Cities: Skylines cities · version 1.0',
      title: 'A map for the city you built.',
      lede: 'Every avenue you drew, every neighbourhood that grew along the river. Vellum turns your save into a map you can explore, read and keep, and that makes you want to go back and keep building.',
      cta: 'Download Vellum',
      bridge: 'And in the game: Vellum Bridge',
      fine: 'Free and open source · Windows, macOS and Linux · also on Microsoft Store',
      credit: 'Day theme',
    },
    gallery: {
      eyebrow: '02 · Real maps',
      title: 'Real cities, from people who play.',
      body: [
        'This is how real saves look when you open them in Vellum: coasts, islands, bridges and avenues someone raised by hand, one stretch at a time.',
      ],
      note: "Other players' cities, each with its credit and link. Yours could be next.",
      captions: {
        islandHopping: 'Day theme · a city spread across the water',
        sanRico: 'Day theme · islands, bridges and corridors',
        westdale: 'Atlantic Keys · Day theme',
      },
      open: 'View {city} full size',
    },
    layers: {
      eyebrow: '03 · Layer by layer',
      title: 'Turn on only what tells your story.',
      body: [
        'Terrain, base map, roads, buildings, forests, districts and transit. Start with the water and keep adding until the city reads on its own. And when a layer asks for more, open it: every layer has its own options panel.',
      ],
      note: '1…7 turns each layer on and off without touching the panel; Shift + 1…7 opens its options.',
      names: [
        'Terrain and water',
        'Roads',
        'Buildings',
        'Forests',
        'Districts',
        'Transit',
      ],
      stripLabel: 'Layers',
      allCaption: '{city} · Day theme',
      panelCaption: 'Options of the Roads layer: the real panel of the app',
      panelNote:
        'In other layers: hypsometric relief and contour lines, buildings by zone, forests as circles or a heat map, district fills.',
    },
    themes: {
      eyebrow: '04 · Themes',
      title: 'The same city, at another hour.',
      body: [
        'Five themes included. Day, the paper you know; Transit, to read your transport; and three inherited from CSL Map View for anyone who missed their old map. None of them yours?',
      ],
      note: "Classic and Grayscale come from the old CSL Map View: if that's where you come from, you're home.",
      left: 'Left side',
      right: 'Right side',
      leftShort: 'Left',
      rightShort: 'Right',
      localized: {
        day: 'Day',
        transit: 'Transit',
        classic: 'Classic',
        grayscale: 'Grayscale',
        grayscaleWater: 'Grayscale + Water',
      },
      inherited: 'inherited from CSL Map View',
      compare: '{city} · drag to compare',
      divider: 'Comparison divider',
      swapped: 'Comparing {left} with {right}',
      schemaLink: 'Make your own .vellumstyle: the schema is public',
      unavailable: 'Shot pending',
    },
    nocturno: {
      eyebrow: '05 · Night',
      title: 'Lights out.',
      body: [
        'With the Transit theme the city goes dark and your lines remain, in the colours you gave them in the game. Turn on "Dim other layers" and the rest of the map fades over a dark background while only your lines stay in full colour.',
      ],
      note: 'To look only at the transport, like from a plane at night.',
      toggle: 'Dim other layers',
      toggleNote: 'Transit theme option',
      figureCaption: 'What the setting looks like in the app',
      caption: '{city} · Transit',
      dimmedCaption: '+ dim other layers',
    },
    schematic: {
      eyebrow: '06 · Schematic view',
      title: 'Your network, drawn like a metro map.',
      body: [
        'Open the schematic view and Vellum redraws every line at 45° angles, like the maps that hang on station platforms. The tangle of the city becomes a diagram you understand at a glance, with your stations and your colours.',
      ],
      note: 'Based on the work of Bast and Brosi (University of Freiburg) on transit maps: LOOM and octi.',
      cells: [
        {
          key: 'Octilinear',
          title: 'Only 0°, 45° and 90°',
          body: 'Every segment settles on the grid, with the turns at the stations.',
        },
        {
          key: 'Stations',
          title: 'One node per station',
          body: 'The platforms of a station collapse into one, with rail first.',
        },
        {
          key: 'Labels',
          title: "Names that don't collide",
          body: 'Stops are labelled without overlapping. Click one to open its card.',
        },
        {
          key: 'Camera',
          title: 'Moves like the map',
          body: 'Smooth zoom and panning, just like the geographic view.',
        },
      ],
      caption: '{city} · schematic view · Day theme',
    },
    districts: {
      eyebrow: '07 · Districts and places',
      title: "Ask the map what's there.",
      body: [
        'Your neighbourhoods appear with their name, their boundary and a fill by specialization, or as markers if you prefer. With a city exported by Vellum Bridge, streets carry their names too.',
        'Click a district, a park or a building and its card opens: population, households, jobs and specializations.',
      ],
      note: 'The names are the ones you gave them in the game. Street names come with Vellum Bridge.',
      caption: '{city} · districts and streets · Day theme',
      cardCaption: 'The real place card of the app, with sample data',
      cardDescription:
        'Card of the sample district Harbor Heights: population, area, type and a bar with households and jobs by sector.',
    },
    creators: {
      eyebrow: '08 · For people who tell their city',
      title: 'Explain your city without fighting the camera.',
      body: [],
      note: "For this week's video, Sunday's stream or the post on Reddit.",
      frame: 'your video · scene 3 · "the new harbour district"',
      caption: 'Costa Tijuca · clean mode (H): the map without the interface',
      cards: [
        {
          key: 'In the video',
          title: 'A map that reads in two seconds',
          body: "Show where each zone is and what you're building. Export as PNG up to 4× or as SVG to edit it.",
        },
        {
          key: 'On stream',
          title: 'Vellum on another screen',
          body: 'Leave it open while you play. H hides the interface and leaves only the map.',
        },
        {
          key: 'To share',
          title: 'Your name in the corner',
          body: 'White, dark or transparent background, and your name in the map marginalia. Ready for Reddit, Steam or the video thumbnail.',
        },
      ],
    },
    plate: {
      eyebrow: '09 · Print',
      title: 'What your map would look like printed.',
      body: [
        'When you export, Vellum can add the marginalia of a real chart: the name of your city, your name, the legend of roads and lines, the scale bar and the north arrow. Export a 4× PNG and take it to print.',
      ],
      note: 'The marginalia panel comes out in the PNG and the SVG, in the corner you choose.',
      cartelTitle: 'Costa Tijuca',
      cartelMeta: 'Day theme · 4× PNG · marginalia bottom left',
      rows: [
        { key: 'Identity', value: 'city name · author' },
        {
          key: 'Legends',
          value: 'road hierarchy · transit lines and modes · elevation',
        },
        { key: 'Aids', value: 'scale bar · orientation' },
        { key: 'Information', value: 'map summary · data source and limits' },
        { key: 'Corner', value: 'any of the four' },
        { key: 'Background', value: 'white · dark · transparent' },
      ],
      footnote:
        'What you see in the panel is what the app exports (DM Mono, the colours of the theme). The texts change with every city.',
    },
    shells: {
      eyebrow: '10 · On your system',
      title: 'At home on every desktop.',
      body: ['The map is the same; the window adapts to your system.'],
      note: "It isn't the same window everywhere: Vellum takes the materials of each system.",
      cards: [
        { title: 'This is Windows', material: 'Mica and Acrylic' },
        { title: 'This is macOS', material: 'Liquid Glass' },
        { title: 'This is Linux', material: 'plain paper' },
      ],
    },
    download: {
      eyebrow: '11 · Download',
      title: 'Your city is waiting.',
      fallbackTitle: 'Download Vellum from GitHub Releases',
      lede: "Free and open source. Pick your system and in a couple of minutes you're looking at your map.",
      platformsLabel: 'Downloads by system',
      recommended: 'Recommended for your system',
      allDownloads: 'All downloads on GitHub Releases',
      storeAlt: 'Get it from Microsoft',
      formats: {
        exe: '.exe installer',
        dmg: '.dmg disk image',
        deb: '.deb · Debian and Ubuntu',
        AppImage: '.AppImage · other distributions',
        rpm: '.rpm · Fedora and openSUSE',
      },
      platformKeys: {
        windows: 'Windows 10 1809 or later · x64',
        macos: 'Universal · Apple Silicon and Intel',
        linux: 'x86_64',
      },
      bridge: {
        eyebrow: 'And in the game',
        title: 'Vellum Bridge',
        bodyStrong: 'Without Bridge, Vellum has nothing to draw.',
        body: "It's the mod that exports your city from Cities: Skylines with a button or Ctrl + Shift + E. Offline and read-only.",
        link: 'Get Vellum Bridge on Steam Workshop',
      },
      cslmap: 'Coming from CSL Map View? Vellum opens your .cslmap files too.',
    },
    pendingAuthor: 'author pending',
    pendingUrl: 'URL pending',
    pendingShot: 'Shot pending',
    standIn: 'stand-in',
    workshop: 'Steam Workshop',
  },
};

/** Replaces `{name}` placeholders in a copy string. */
export function fill(text: string, values: Record<string, string>): string {
  return text.replace(
    /\{(\w+)\}/g,
    (match, key: string) => values[key] ?? match,
  );
}
