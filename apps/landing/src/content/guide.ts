import type { Lang } from './routes';
import type { ShotId } from './shots';

/**
 * Copy of the Guide (EXPERIENCE.md · Páginas · Guía): "From nothing to
 * seeing your city" in six steps. The UI is named by its real visible label
 * (`packages/ui` locales, Bridge `Strings.cs`) in the language of the page.
 * Strings go through `richLinks()`: `**strong**`, `*em*`, `` `code` ``,
 * `[[kbd]]` and `{key|label}` prose links, whose targets the page sets
 * (`download`, `smartscreen`, `macos`, `manual`, `issues`).
 */

/** Step anchors, in English in both languages (they survive a language switch). */
export type GuideStepId =
  | 'install'
  | 'bridge'
  | 'export'
  | 'open'
  | 'explore'
  | 'share';

export interface GuideStepCopy {
  id: GuideStepId;
  /** Short label of the side index. */
  toc: string;
  /** H2, with `rich()` markup. */
  title: string;
  /** The essential step: number in the link colour and a visible flag. */
  required?: boolean;
  body: string[];
  /** Key groups, joined with « · ». */
  keys?: string[];
  tip?: string;
  shot: ShotId;
}

export interface GuideCopy {
  meta: { title: string; description: string };
  header: {
    eyebrow: string;
    title: string;
    lede: string;
    needLabel: string;
    need: string[];
  };
  toc: { title: string; advanced: string; help: string };
  /** «PASO n DE N» under the number (`{n}`, `{total}`). */
  stepOf: string;
  required: string;
  bridge: { workshop: string; download: string };
  steps: GuideStepCopy[];
  done: { cslmap: string; finish: string };
  advanced: {
    eyebrow: string;
    soon: string;
    title: string;
    lede: string;
    topics: string[];
  };
}

export const GUIDE: Record<Lang, GuideCopy> = {
  es: {
    meta: {
      title: 'Guía · Vellum',
      description:
        'De cero a ver tu ciudad en seis pasos: instala Vellum y Vellum Bridge, exporta tu ciudad desde Cities: Skylines, ábrela en Vellum, explórala y comparte el mapa.',
    },
    header: {
      eyebrow: 'Guía rápida',
      title: 'De cero a ver *tu ciudad.*',
      lede: 'Seis pasos. Al final tendrás tu ciudad abierta en Vellum y un mapa exportado listo para compartir.',
      needLabel: 'Lo que necesitas',
      need: [
        'Cities: Skylines (el primero)',
        'una partida tuya',
        'Windows, macOS o Linux',
      ],
    },
    toc: {
      title: 'En esta guía',
      advanced: 'Temas avanzados',
      help: '¿Te atascaste? {issues|Abre un issue en GitHub} y lo veo.',
    },
    stepOf: 'Paso {n} de {total}',
    required: 'Imprescindible',
    bridge: {
      workshop: 'Vellum Bridge en Steam Workshop',
      download: 'Cómo conseguir Vellum Bridge',
    },
    steps: [
      {
        id: 'install',
        toc: 'Instala Vellum',
        title: 'Instala Vellum',
        body: [
          'Descárgalo para tu sistema desde la {download|página de descarga} e instálalo. Si Windows te avisa la primera vez, {smartscreen|aquí te cuento por qué y qué pulsar}; en macOS, {macos|cómo abrirlo la primera vez}.',
        ],
        tip: 'En Windows también puedes usar la Microsoft Store: va firmada y se actualiza sola.',
        shot: 'T25',
      },
      {
        id: 'bridge',
        toc: 'Instala Vellum Bridge',
        title: 'Instala Vellum Bridge',
        required: true,
        body: [
          '**Sin Bridge, Vellum no tiene nada que dibujar.** Es el mod que saca tu ciudad del juego. Suscríbete en Steam Workshop: Steam lo instala y lo mantiene al día.',
          'Luego abre Cities: Skylines y, en **Gestor de contenido → Mods**, comprueba que Vellum Bridge está activado.',
        ],
        tip: '¿Sin Workshop? {manual|Instalación manual}, en la página de descarga.',
        shot: 'T26',
      },
      {
        id: 'export',
        toc: 'Exporta en el juego',
        title: 'En el juego, *exporta tu ciudad*',
        body: [
          'Carga tu partida. En **Opciones → Vellum Bridge**, pulsa **Exportar ciudad**, o pulsa [[Ctrl]] + [[Shift]] + [[E]] en la partida.',
          'Bridge guarda un archivo `.vellummap` en `Documentos\\Vellum Bridge`, una carpeta por ciudad (en macOS y Linux, en `~/Vellum Bridge`). Solo lee: no cambia nada de tu partida y no se conecta a internet. Al terminar, una ventana te muestra la ruta del archivo.',
        ],
        keys: ['[[Ctrl]] + [[Shift]] + [[E]] en la partida'],
        tip: 'El juego se pausa un momento mientras Bridge captura tu ciudad y sigue solo.',
        shot: 'T27',
      },
      {
        id: 'open',
        toc: 'Ábrela en Vellum',
        title: 'Ábrela en Vellum',
        body: [
          'Abre Vellum. En la bienvenida, donde dice «Arrastra tu ciudad (.vellummap o .cslmap) aquí», suelta tu `.vellummap`. También puedes pulsar **Abrir archivo** y elegirlo.',
        ],
        keys: ['[[Ctrl]] + [[O]] en Windows y Linux', '[[⌘]] + [[O]] en macOS'],
        shot: 'T28',
      },
      {
        id: 'explore',
        toc: 'Explora',
        title: 'Explora: *capas y temas*',
        body: [
          'En la barra lateral, en **Capas**, enciende y apaga cada una: terreno, mapa base, vías, tránsito, edificios, bosques y distritos. En **Estilo de mapa**, cambia de tema. Y abre la **Vista esquemática** para ver tu red de tránsito como un plano de metro.',
        ],
        keys: [
          '[[1]]…[[7]] muestra u oculta una capa',
          '[[Shift]] + [[1]]…[[7]] sus opciones',
          '[[?]] todos los atajos',
        ],
        tip: 'Las teclas siguen el orden de la barra lateral: [[1]] es el terreno y [[7]], los distritos.',
        shot: 'T30',
      },
      {
        id: 'share',
        toc: 'Exporta y comparte',
        title: 'Exporta y *comparte*',
        body: [
          'Pulsa [[Ctrl]] + [[E]] ([[⌘]] + [[E]] en macOS) para abrir **Exportar mapa**. Elige PNG a 1×, 2× o 4×, o SVG si lo vas a editar, y un **Fondo**: **Blanco**, **Oscuro** o **Transparente**.',
          'Si quieres, añade la marginalia: el nombre de tu ciudad, las leyendas, la escala gráfica y la orientación.',
        ],
        keys: [
          '[[Ctrl]] + [[E]] exportar en Windows y Linux',
          '[[⌘]] + [[E]] en macOS',
          '[[H]] vista limpia, solo el mapa',
        ],
        tip: '¿Un video o un directo? [[H]] esconde la interfaz y deja solo tu ciudad.',
        shot: 'T29',
      },
    ],
    done: {
      cslmap:
        '¿Vienes de CSL Map View? Abre tu `.cslmap` igual: suéltalo en la bienvenida o usa **Abrir archivo**.',
      finish: 'Listo. Ahora, *a seguir construyendo.*',
    },
    advanced: {
      eyebrow: 'Temas avanzados',
      soon: 'Próximamente',
      title: 'Cuando quieras *ir más allá.*',
      lede: 'Páginas cortas, una por tema, para cuando ya tengas tu ciudad abierta. Llegan a esta guía en una próxima versión:',
      topics: [
        'Capas y sus opciones',
        'Temas y `.vellumstyle`',
        'Vista esquemática',
        'Distritos y tarjeta de lugar',
        'Exportar para video y redes',
        'Atajos',
      ],
    },
  },
  en: {
    meta: {
      title: 'Guide · Vellum',
      description:
        'From nothing to seeing your city in six steps: install Vellum and Vellum Bridge, export your city from Cities: Skylines, open it in Vellum, explore it and share the map.',
    },
    header: {
      eyebrow: 'Quick guide',
      title: 'From nothing to seeing *your city.*',
      lede: "Six steps. At the end you'll have your city open in Vellum and an exported map ready to share.",
      needLabel: 'What you need',
      need: [
        'Cities: Skylines (the first one)',
        'a save of your own',
        'Windows, macOS or Linux',
      ],
    },
    toc: {
      title: 'In this guide',
      advanced: 'Advanced topics',
      help: "Stuck? {issues|Open an issue on GitHub} and I'll take a look.",
    },
    stepOf: 'Step {n} of {total}',
    required: 'Essential',
    bridge: {
      workshop: 'Vellum Bridge on Steam Workshop',
      download: 'How to get Vellum Bridge',
    },
    steps: [
      {
        id: 'install',
        toc: 'Install Vellum',
        title: 'Install Vellum',
        body: [
          'Download it for your system from the {download|download page} and install it. If Windows warns you the first time, {smartscreen|here is why, and what to click}; on macOS, {macos|how to open it the first time}.',
        ],
        tip: "On Windows you can also use the Microsoft Store: it's signed and updates itself.",
        shot: 'T25',
      },
      {
        id: 'bridge',
        toc: 'Install Vellum Bridge',
        title: 'Install Vellum Bridge',
        required: true,
        body: [
          "**Without Bridge, Vellum has nothing to draw.** It's the mod that takes your city out of the game. Subscribe on Steam Workshop: Steam installs it and keeps it up to date.",
          'Then open Cities: Skylines and, in **Content Manager → Mods**, check that Vellum Bridge is enabled.',
        ],
        tip: 'No Workshop? {manual|Manual install}, on the download page.',
        shot: 'T26',
      },
      {
        id: 'export',
        toc: 'Export in the game',
        title: 'In the game, *export your city*',
        body: [
          'Load your save. In **Options → Vellum Bridge**, click **Export city**, or press [[Ctrl]] + [[Shift]] + [[E]] in game.',
          "Bridge saves a `.vellummap` file in `Documents\\Vellum Bridge`, one folder per city (on macOS and Linux, in `~/Vellum Bridge`). It only reads: nothing in your save changes, and it never connects to the internet. When it's done, a window shows you the path of the file.",
        ],
        keys: ['[[Ctrl]] + [[Shift]] + [[E]] in game'],
        tip: 'The game pauses for a moment while Bridge captures your city, then resumes on its own.',
        shot: 'T27',
      },
      {
        id: 'open',
        toc: 'Open it in Vellum',
        title: 'Open it in Vellum',
        body: [
          'Open Vellum. On the welcome, where it says “Drop your city (.vellummap or .cslmap) here”, drop your `.vellummap`. You can also click **Open file** and pick it.',
        ],
        keys: [
          '[[Ctrl]] + [[O]] on Windows and Linux',
          '[[⌘]] + [[O]] on macOS',
        ],
        shot: 'T28',
      },
      {
        id: 'explore',
        toc: 'Explore',
        title: 'Explore: *layers and themes*',
        body: [
          'In the sidebar, under **Layers**, turn each one on and off: terrain, base map, roads, transit, buildings, forests and districts. Under **Map style**, change the theme. And open the **Schematic view** to see your transit network as a metro map.',
        ],
        keys: [
          '[[1]]…[[7]] show or hide a layer',
          '[[Shift]] + [[1]]…[[7]] its options',
          '[[?]] every shortcut',
        ],
        tip: 'The keys follow the order of the sidebar: [[1]] is the terrain and [[7]] the districts.',
        shot: 'T30',
      },
      {
        id: 'share',
        toc: 'Export and share',
        title: 'Export and *share*',
        body: [
          'Press [[Ctrl]] + [[E]] ([[⌘]] + [[E]] on macOS) to open **Export Map**. Pick PNG at 1×, 2× or 4×, or SVG if you will edit it, and a **Background**: **White**, **Dark** or **Transparent**.',
          'If you like, add the marginalia: the name of your city, the legends, the graphic scale and the orientation.',
        ],
        keys: [
          '[[Ctrl]] + [[E]] export on Windows and Linux',
          '[[⌘]] + [[E]] on macOS',
          '[[H]] clean view, just the map',
        ],
        tip: 'A video or a stream? [[H]] hides the interface and leaves only your city.',
        shot: 'T29',
      },
    ],
    done: {
      cslmap:
        'Coming from CSL Map View? Open your `.cslmap` the same way: drop it on the welcome or use **Open file**.',
      finish: 'Done. Now, *back to building.*',
    },
    advanced: {
      eyebrow: 'Advanced topics',
      soon: 'Coming soon',
      title: 'When you want to *go further.*',
      lede: 'Short pages, one per topic, for when your city is already open. They arrive in this guide in a later version:',
      topics: [
        'Layers and their options',
        'Themes and `.vellumstyle`',
        'Schematic view',
        'Districts and the place card',
        'Exporting for video and social media',
        'Shortcuts',
      ],
    },
  },
};
