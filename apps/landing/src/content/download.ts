import type { PlatformId } from '../data/release';
import type { Lang } from './routes';

/**
 * Copy of the download page (EXPERIENCE.md · Páginas · Descarga). Spanish
 * follows pages-2 as corrected by the spines; English follows the voice of
 * the home. Strings go through `rich()`: `**strong**`, `*em*`, `` `code` ``
 * and `[[kbd]]`; `{name}` placeholders go through `fill()`.
 */
export interface DownloadCopy {
  meta: { title: string; description: string };
  header: {
    eyebrow: string;
    eyebrowNoVersion: string;
    /** H1 without JS. */
    title: string;
    /** H1 with a detected system (`{os}`). */
    titleDetected: string;
    /** H1 when the system is not recognized. */
    titleUnknown: string;
    /** H1 when the release could not be read. */
    titleFallback: string;
    lede: string;
    fallbackLede: string;
    note: string;
    detected: string;
    notYours: string;
    unknown: string;
    unknownLink: string;
  };
  step1: string;
  primary: {
    /** Visible label of the main installer button (`{os}`). */
    button: string;
    /** Second line of the button, after the file name. */
    detail: Record<PlatformId, string>;
    or: string;
    storeAlt: string;
    storeNote: string;
    released: string;
    other: string;
    allDownloads: string;
    msiNote: string;
    /** The MSI in the language of the page. */
    msiHere: string;
    /** Summary of the folded MSI in the other language. */
    msiOther: string;
    twin: string;
    gatekeeper: string;
    gatekeeperLink: string;
  };
  shell: Record<PlatformId, { title: string; material: string }>;
  stepLine: string;
  stepLineLink: string;
  bridge: {
    tag: string;
    title: string;
    lede: string;
    note: string;
    started: string;
    workshop: { key: string; title: string; body: string; button: string };
    manual: {
      key: string;
      title: string;
      soon: string;
      body: string;
      changelog: string;
    };
  };
  smartscreen: {
    eyebrow: string;
    title: string;
    lede: string;
    note: string;
    steps: [string, string, string];
    dialog: {
      title: string;
      body: string;
      more: string;
      app: string;
      publisher: string;
      run: string;
      dontRun: string;
    };
    done: { title: string; body: string };
    caption: string;
    why: {
      openSource: { title: string; body: string; link: string };
      verify: { title: string; body: string; link: string };
      store: { title: string; body: string };
    };
  };
  platforms: {
    eyebrow: string;
    title: string;
    note: string;
    recommended: string;
    keys: Record<PlatformId, string>;
    meta: Record<PlatformId, string>;
    store: string;
    formats: Record<string, string>;
    action: string;
    windowsNote: string;
    windowsNoteLink: string;
    gatekeeper: string;
    allDownloads: string;
  };
  requirements: {
    eyebrow: string;
    title: string;
    note: string;
    rows: { key: string; value: string }[];
  };
  update: {
    eyebrow: string;
    title: string;
    note: string;
    noteLink: string;
    columns: { key: string; title: string; body: string }[];
  };
  verify: {
    summary: string;
    meta: string;
    body: string;
    note: string;
    commands: Record<PlatformId, string>;
    caption: string;
    file: string;
    hash: string;
    labels: Record<string, string>;
    recommended: string;
    copy: string;
    copied: string;
    copyLabel: string;
    announce: string;
  };
  after: {
    eyebrow: string;
    title: string;
    lede: string;
    steps: [string, string, string];
    cslmap: string;
    guide: string;
    changelog: string;
    reminder: { tag: string; title: string; body: string; link: string };
  };
  mobile: {
    title: string;
    lede: string;
    copy: string;
    copied: string;
    announce: string;
    share: string;
    fine: string;
    address: string;
  };
}

export const DOWNLOAD: Record<Lang, DownloadCopy> = {
  es: {
    meta: {
      title: 'Descargar · Vellum',
      description:
        'Descarga Vellum para Windows, macOS o Linux, instala Vellum Bridge en Cities: Skylines y abre tu ciudad como un mapa. Gratis y de código abierto.',
    },
    header: {
      eyebrow: 'Descarga · Vellum {version} · gratis y de código abierto',
      eyebrowNoVersion: 'Descarga · gratis y de código abierto',
      title: 'Descarga *Vellum.*',
      titleDetected: 'Descarga Vellum *para {os}.*',
      titleUnknown: 'Elige *tu sistema.*',
      titleFallback: 'Descarga Vellum desde GitHub Releases',
      lede: 'Son dos piezas: **Vellum**, la app donde ves tu mapa, y **Vellum Bridge**, el mod que saca tu ciudad del juego. Empieza por la app.',
      fallbackLede:
        'Ahora mismo no puedo enlazar cada archivo, pero todos están en la página del último release.',
      note: 'Sin cuenta ni registro: Vellum funciona en tu equipo y sin conexión.',
      detected: 'Parece que usas {os}.',
      notYours: '¿No es tu sistema?',
      unknown: 'No se pudo reconocer tu sistema.',
      unknownLink: 'Todas las opciones están aquí.',
    },
    step1: 'Paso 1 de 2 · la app',
    primary: {
      button: 'Descargar para {os}',
      detail: {
        windows: '64 bits',
        macos: 'Apple Silicon e Intel',
        linux: 'x86_64',
      },
      or: 'o',
      storeAlt: 'Obtenlo de Microsoft',
      storeNote: 'Sin aviso de SmartScreen y se actualiza sola.',
      released: 'Vellum {version} · publicada el',
      other: 'Otras opciones:',
      allDownloads: 'Todas las descargas en GitHub Releases',
      msiNote: '(despliegues gestionados)',
      msiHere: 'MSI en español',
      msiOther: 'MSI en inglés',
      twin: '**¿Store o instalador?** Es la misma app. La de la Store va firmada y se actualiza sola; la del instalador busca versiones nuevas al abrirse, y puedes apagarlo en Preferencias. Cada una guarda sus datos y temas por separado y no se pasan de una a otra: elige una y quédate con ella.',
      gatekeeper:
        'Vellum aún no está notarizado por Apple: la primera vez, macOS puede negarse a abrirlo.',
      gatekeeperLink: 'Cómo abrirlo',
    },
    shell: {
      windows: {
        title: 'Así se ve en Windows',
        material: 'al estilo de Mica y Acrylic',
      },
      macos: {
        title: 'Así se ve en macOS',
        material: 'al estilo de Liquid Glass',
      },
      linux: { title: 'Así se ve en Linux', material: 'papel por defecto' },
    },
    stepLine: '**Paso 2 · imprescindible:** Vellum Bridge, en el juego.',
    stepLineLink: 'Ir al paso 2',
    bridge: {
      tag: 'Paso 2 de 2 · imprescindible',
      title: 'Ahora, *Vellum Bridge.*',
      lede: '**Sin Bridge, Vellum no tiene nada que dibujar.** Es el mod que saca tu ciudad de Cities: Skylines: en el juego pulsas el botón de Bridge o [[Ctrl]] + [[Shift]] + [[E]] y guarda un archivo `.vellummap` que Vellum abre. Funciona sin conexión y solo lee: no cambia nada de tu partida.',
      note: 'Bridge es el mismo para Windows, macOS y Linux: es un mod del juego, no de tu sistema.',
      started: 'Tu descarga empezó.',
      workshop: {
        key: 'Con Steam · recomendado',
        title: 'Suscríbete en Steam Workshop',
        body: 'Steam lo instala y lo mantiene al día. Luego, en el juego, actívalo en **Gestor de contenido → Mods**.',
        button: 'Suscribirse en Steam Workshop',
      },
      manual: {
        key: 'Sin Workshop',
        title: 'Instalación manual',
        soon: 'Próximamente',
        body: 'La instalación manual sin Workshop llegará en una próxima versión. Por ahora, Bridge se instala desde Steam Workshop.',
        changelog: 'Sigue las novedades',
      },
    },
    smartscreen: {
      eyebrow: 'Si Windows te avisa',
      title: 'Windows puede avisarte. *Es normal.*',
      lede: 'Vellum aún no tiene firma de código. La primera vez que abras el instalador, Windows te avisará de un editor desconocido: elige *Más información → Ejecutar de todas formas*. Si prefieres evitarlo, la Microsoft Store lo instala firmado.',
      note: 'Nunca te pediré desactivar SmartScreen ni el antivirus.',
      steps: [
        '1 · pulsa «Más información»',
        '2 · «Ejecutar de todas formas»',
        '3 · listo',
      ],
      dialog: {
        title: 'Windows protegió su PC',
        body: 'Microsoft Defender SmartScreen impidió el inicio de una aplicación no reconocida. Ejecutar esta aplicación puede poner en riesgo su PC.',
        more: 'Más información',
        app: 'Aplicación:',
        publisher: 'Editor: Editor desconocido',
        run: 'Ejecutar de todas formas',
        dontRun: 'No ejecutar',
      },
      done: {
        title: 'Se abre el instalador de Vellum',
        body: 'Síguelo hasta el final y Vellum queda instalado.',
      },
      caption: 'Recreación del diálogo de Windows, no una captura.',
      why: {
        openSource: {
          title: 'Es código abierto',
          body: 'Todo el código está en GitHub y los instaladores se compilan ahí, a la vista.',
          link: 'Ver el repositorio',
        },
        verify: {
          title: 'Puedes comprobarlo',
          body: 'Cada archivo tiene su huella SHA256: si coincide con la publicada, es exactamente el que subí.',
          link: 'Verificar la descarga',
        },
        store: {
          title: '¿Prefieres no verlo?',
          body: 'Instala desde Microsoft Store: la app va firmada y no hay aviso.',
        },
      },
    },
    platforms: {
      eyebrow: 'Todas las plataformas',
      title: 'Windows, macOS *y Linux.*',
      note: 'Mismo mapa, misma app: la ventana se viste al estilo de cada sistema.',
      recommended: 'Recomendado para tu sistema',
      keys: {
        windows: 'Windows 10 1809 o posterior · x64',
        macos: 'Apple Silicon e Intel · macOS 10.15 o posterior',
        linux: 'x86_64',
      },
      meta: {
        windows: 'Microsoft Store, instalador .exe o MSI',
        macos: 'Un solo .dmg universal',
        linux: 'Elige el formato de tu distribución',
      },
      store: 'Microsoft Store · firmada y se actualiza sola',
      formats: {
        exe: '.exe · instalador para tu usuario, sin permisos de administrador',
        'msi-es':
          '.msi en español · equipos gestionados; puede asociar los .cslmap',
        'msi-en':
          '.msi en inglés · equipos gestionados; puede asociar los .cslmap',
        dmg: '.dmg universal · Apple Silicon e Intel',
        deb: '.deb · Debian, Ubuntu y derivadas',
        AppImage:
          '.AppImage · cualquier otra distribución; márcalo como ejecutable',
        rpm: '.rpm · Fedora y RHEL',
      },
      action: 'Descargar {format}',
      windowsNote:
        'Sin firma de código: SmartScreen puede avisarte la primera vez. La Store no muestra ese aviso.',
      windowsNoteLink: 'Cómo seguir',
      gatekeeper:
        'Vellum aún no está notarizado por Apple, así que la primera vez macOS puede negarse a abrirlo. Ve a **Ajustes del Sistema → Privacidad y seguridad** y permite abrir Vellum. Si macOS sigue negándose, en la Terminal: `xattr -cr /Applications/Vellum.app`',
      allDownloads: 'Todas las descargas en GitHub Releases',
    },
    requirements: {
      eyebrow: 'Requisitos',
      title: 'Lo que *necesitas.*',
      note: 'Vellum funciona sin conexión: la única petición de red es la búsqueda de actualizaciones al abrirse, y puedes apagarla en Preferencias.',
      rows: [
        {
          key: 'Windows',
          value:
            'Windows 10 versión 1809 (10.0.17763) o posterior, 64 bits (x64). Usa WebView2: si falta, Vellum te avisa.',
        },
        {
          key: 'macOS',
          value: 'macOS 10.15 o posterior, en Apple Silicon o Intel.',
        },
        {
          key: 'Linux',
          value:
            'x86_64: Debian y Ubuntu (`.deb`), Fedora y RHEL (`.rpm`) y otras distribuciones con AppImage.',
        },
        {
          key: 'El juego',
          value:
            'Cities: Skylines (el primero), con Vellum Bridge para exportar tu ciudad; por ahora, Bridge se instala desde Steam Workshop. Para abrir un `.vellummap` o un `.cslmap` que ya tienes no hace falta el juego.',
        },
      ],
    },
    update: {
      eyebrow: 'Cómo actualizar',
      title: 'Al día, *sin perseguir versiones.*',
      note: 'Lo que cambia en cada versión está en sus notas de GitHub.',
      noteLink: 'Ver las notas de la versión',
      columns: [
        {
          key: 'Instalador .exe y .msi · .dmg · AppImage',
          title: 'Vellum te avisa',
          body: 'Vellum busca versiones nuevas al abrirse y te ofrece instalarlas; puedes apagarlo en Preferencias. También puedes volver a descargarla aquí.',
        },
        {
          key: 'Microsoft Store',
          title: 'Se actualiza sola',
          body: 'La Store se encarga, como con cualquier otra app.',
        },
        {
          key: '.deb y .rpm',
          title: 'Reinstala encima',
          body: 'Descarga la versión nueva de esta página e instálala sobre la anterior.',
        },
        {
          key: 'Vellum Bridge',
          title: 'Steam lo mantiene',
          body: 'Con Workshop, Steam lo actualiza solo cuando abres el juego.',
        },
      ],
    },
    verify: {
      summary: 'Verificar la descarga',
      meta: 'opcional · SHA256',
      body: 'Cada archivo tiene una huella SHA256. Calcula la del archivo que bajaste y compárala con la de esta lista: si coinciden, es exactamente el que publiqué, sin cambios en el camino. Ejecuta el comando en la carpeta de descargas con el archivo que bajaste; `Get-FileHash` muestra la huella en mayúsculas, así que compáralas sin fijarte en mayúsculas y minúsculas.',
      note: 'GitHub calcula cada huella al publicar el archivo.',
      commands: {
        windows: 'Windows (PowerShell)',
        macos: 'macOS',
        linux: 'Linux',
      },
      caption: 'Huellas SHA256 de Vellum {version}',
      file: 'Archivo',
      hash: 'SHA256',
      labels: {
        exe: 'Windows · instalador',
        'msi-es': 'Windows · MSI en español',
        'msi-en': 'Windows · MSI en inglés',
        dmg: 'macOS · universal',
        deb: 'Linux · Debian y Ubuntu',
        AppImage: 'Linux · otras distribuciones',
        rpm: 'Linux · Fedora y RHEL',
      },
      recommended: 'recomendado',
      copy: 'Copiar',
      copied: 'Copiado ✓',
      copyLabel: 'Copiar SHA256 de {file}',
      announce: 'Copiado',
    },
    after: {
      eyebrow: 'Después de descargar',
      title: '¿Primera vez? *Así sigue.*',
      lede: 'De cero a ver tu ciudad en tres pasos:',
      steps: [
        '**Instala Vellum Bridge** en el juego, desde Steam Workshop.',
        '**Exporta tu ciudad:** en el juego, pulsa el botón de Bridge o [[Ctrl]] + [[Shift]] + [[E]]. Se guarda un `.vellummap`, una carpeta por ciudad.',
        '**Ábrela en Vellum:** arrastra el `.vellummap` a la ventana o usa [[Ctrl]] + [[O]].',
      ],
      cslmap:
        '¿Vienes de CSL Map View? Vellum también abre tus archivos `.cslmap`.',
      guide: 'Abrir la guía rápida',
      changelog: 'Novedades de la {version}',
      reminder: {
        tag: 'No te olvides',
        title: 'Vellum Bridge, en el juego',
        body: 'Sin él, Vellum no tiene nada que abrir.',
        link: 'Ir al paso 2',
      },
    },
    mobile: {
      title: 'Vellum es *para escritorio.*',
      lede: 'Lo instalas en el PC donde juegas Cities: Skylines. Envíate el enlace y descárgalo allí.',
      copy: 'Copiar enlace',
      copied: 'Enlace copiado ✓',
      announce: 'Enlace copiado',
      share: 'Compartir…',
      fine: 'Compartir abre el menú de tu teléfono. No guardo nada.',
      address: 'La dirección:',
    },
  },
  en: {
    meta: {
      title: 'Download · Vellum',
      description:
        'Download Vellum for Windows, macOS or Linux, install Vellum Bridge in Cities: Skylines and open your city as a map. Free and open source.',
    },
    header: {
      eyebrow: 'Download · Vellum {version} · free and open source',
      eyebrowNoVersion: 'Download · free and open source',
      title: 'Download *Vellum.*',
      titleDetected: 'Download Vellum *for {os}.*',
      titleUnknown: 'Choose *your system.*',
      titleFallback: 'Download Vellum from GitHub Releases',
      lede: 'It comes in two pieces: **Vellum**, the app where you see your map, and **Vellum Bridge**, the mod that takes your city out of the game. Start with the app.',
      fallbackLede:
        "I can't link each file right now, but they are all on the page of the latest release.",
      note: 'No account, no sign-up: Vellum runs on your machine and offline.',
      detected: "Looks like you're on {os}.",
      notYours: 'Not your system?',
      unknown: "Your system couldn't be recognized.",
      unknownLink: 'Every option is right here.',
    },
    step1: 'Step 1 of 2 · the app',
    primary: {
      button: 'Download for {os}',
      detail: {
        windows: '64-bit',
        macos: 'Apple Silicon and Intel',
        linux: 'x86_64',
      },
      or: 'or',
      storeAlt: 'Get it from Microsoft',
      storeNote: 'No SmartScreen warning, and it updates itself.',
      released: 'Vellum {version} · released',
      other: 'Other options:',
      allDownloads: 'All downloads on GitHub Releases',
      msiNote: '(managed deployments)',
      msiHere: 'MSI in English',
      msiOther: 'MSI in Spanish',
      twin: "**Store or installer?** It's the same app. The Store edition is signed and updates itself; the installer edition checks for new versions when it starts, and you can turn that off in Preferences. Each keeps its data and themes separately and they don't carry over, so pick one and stick with it.",
      gatekeeper:
        "Vellum isn't notarized by Apple yet: the first time, macOS may refuse to open it.",
      gatekeeperLink: 'How to open it',
    },
    shell: {
      windows: {
        title: 'How it looks on Windows',
        material: 'in the style of Mica and Acrylic',
      },
      macos: {
        title: 'How it looks on macOS',
        material: 'in the style of Liquid Glass',
      },
      linux: { title: 'How it looks on Linux', material: 'default paper' },
    },
    stepLine: '**Step 2 · essential:** Vellum Bridge, in the game.',
    stepLineLink: 'Go to step 2',
    bridge: {
      tag: 'Step 2 of 2 · essential',
      title: 'Now, *Vellum Bridge.*',
      lede: "**Without Bridge, Vellum has nothing to draw.** It's the mod that takes your city out of Cities: Skylines: in the game you press the Bridge button or [[Ctrl]] + [[Shift]] + [[E]] and it saves a `.vellummap` file that Vellum opens. It works offline and only reads: nothing in your save changes.",
      note: "Bridge is the same for Windows, macOS and Linux: it's a mod for the game, not for your system.",
      started: 'Your download has started.',
      workshop: {
        key: 'With Steam · recommended',
        title: 'Subscribe on Steam Workshop',
        body: 'Steam installs it and keeps it up to date. Then, in the game, enable it in **Content Manager → Mods**.',
        button: 'Subscribe on Steam Workshop',
      },
      manual: {
        key: 'Without Workshop',
        title: 'Manual install',
        soon: 'Coming soon',
        body: 'Installing without Workshop arrives in a later version. For now, Bridge installs from Steam Workshop.',
        changelog: "Follow what's new",
      },
    },
    smartscreen: {
      eyebrow: 'If Windows warns you',
      title: "Windows may warn you. *That's normal.*",
      lede: "Vellum isn't code-signed yet. The first time you open the installer, Windows will warn you about an unknown publisher: choose *More info → Run anyway*. If you'd rather skip that, Microsoft Store installs it signed.",
      note: "I'll never ask you to turn off SmartScreen or your antivirus.",
      steps: ['1 · click “More info”', '2 · “Run anyway”', '3 · done'],
      dialog: {
        title: 'Windows protected your PC',
        body: 'Microsoft Defender SmartScreen prevented an unrecognized app from starting. Running this app might put your PC at risk.',
        more: 'More info',
        app: 'App:',
        publisher: 'Publisher: Unknown publisher',
        run: 'Run anyway',
        dontRun: "Don't run",
      },
      done: {
        title: 'The Vellum installer opens',
        body: 'Follow it to the end and Vellum is installed.',
      },
      caption: 'A recreation of the Windows dialog, not a screenshot.',
      why: {
        openSource: {
          title: "It's open source",
          body: 'All the code is on GitHub, and the installers are built there, in the open.',
          link: 'See the repository',
        },
        verify: {
          title: 'You can check it',
          body: 'Every file has its SHA256 fingerprint: if it matches the published one, it is exactly the file I uploaded.',
          link: 'Verify the download',
        },
        store: {
          title: 'Rather not see it?',
          body: 'Install from Microsoft Store: the app is signed and there is no warning.',
        },
      },
    },
    platforms: {
      eyebrow: 'Every platform',
      title: 'Windows, macOS *and Linux.*',
      note: 'Same map, same app: the window dresses in the style of each system.',
      recommended: 'Recommended for your system',
      keys: {
        windows: 'Windows 10 1809 or later · x64',
        macos: 'Apple Silicon and Intel · macOS 10.15 or later',
        linux: 'x86_64',
      },
      meta: {
        windows: 'Microsoft Store, .exe installer or MSI',
        macos: 'One universal .dmg',
        linux: 'Pick the format of your distribution',
      },
      store: 'Microsoft Store · signed, updates itself',
      formats: {
        exe: '.exe · installs for your user, no administrator rights',
        'msi-en':
          '.msi in English · managed machines; can associate .cslmap files',
        'msi-es':
          '.msi in Spanish · managed machines; can associate .cslmap files',
        dmg: 'universal .dmg · Apple Silicon and Intel',
        deb: '.deb · Debian, Ubuntu and derivatives',
        AppImage: '.AppImage · any other distribution; mark it as executable',
        rpm: '.rpm · Fedora and RHEL',
      },
      action: 'Download {format}',
      windowsNote:
        "Not code-signed: SmartScreen may warn you the first time. The Store doesn't show that warning.",
      windowsNoteLink: 'What to do',
      gatekeeper:
        "Vellum isn't notarized by Apple yet, so the first time macOS may refuse to open it. Go to **System Settings → Privacy & Security** and allow Vellum to open. If macOS still refuses, in Terminal: `xattr -cr /Applications/Vellum.app`",
      allDownloads: 'All downloads on GitHub Releases',
    },
    requirements: {
      eyebrow: 'Requirements',
      title: 'What *you need.*',
      note: 'Vellum works offline: its only network request is the update check when it starts, and you can turn it off in Preferences.',
      rows: [
        {
          key: 'Windows',
          value:
            'Windows 10 version 1809 (10.0.17763) or later, 64-bit (x64). It uses WebView2: if it is missing, Vellum tells you.',
        },
        {
          key: 'macOS',
          value: 'macOS 10.15 or later, on Apple Silicon or Intel.',
        },
        {
          key: 'Linux',
          value:
            'x86_64: Debian and Ubuntu (`.deb`), Fedora and RHEL (`.rpm`) and other distributions with AppImage.',
        },
        {
          key: 'The game',
          value:
            "Cities: Skylines (the first one), with Vellum Bridge to export your city; for now, Bridge installs from Steam Workshop. To open a `.vellummap` or a `.cslmap` you already have, you don't need the game.",
        },
      ],
    },
    update: {
      eyebrow: 'How to update',
      title: 'Up to date, *without chasing versions.*',
      note: 'What changes in each version is in its notes on GitHub.',
      noteLink: 'See the release notes',
      columns: [
        {
          key: '.exe and .msi installers · .dmg · AppImage',
          title: 'Vellum tells you',
          body: 'Vellum checks for new versions when it starts and offers to install them; you can turn that off in Preferences. You can also download it again here.',
        },
        {
          key: 'Microsoft Store',
          title: 'It updates itself',
          body: 'The Store takes care of it, like any other app.',
        },
        {
          key: '.deb and .rpm',
          title: 'Install over it',
          body: 'Download the new version from this page and install it over the old one.',
        },
        {
          key: 'Vellum Bridge',
          title: 'Steam keeps it current',
          body: 'With Workshop, Steam updates it on its own when you open the game.',
        },
      ],
    },
    verify: {
      summary: 'Verify the download',
      meta: 'optional · SHA256',
      body: 'Every file has a SHA256 fingerprint. Compute the one of the file you downloaded and compare it with this list: if they match, it is exactly the file I published, unchanged on the way. Run the command in your downloads folder with the file you downloaded; `Get-FileHash` prints the fingerprint in uppercase, so compare them ignoring case.',
      note: 'GitHub computes each fingerprint when the file is published.',
      commands: {
        windows: 'Windows (PowerShell)',
        macos: 'macOS',
        linux: 'Linux',
      },
      caption: 'SHA256 fingerprints of Vellum {version}',
      file: 'File',
      hash: 'SHA256',
      labels: {
        exe: 'Windows · installer',
        'msi-en': 'Windows · MSI in English',
        'msi-es': 'Windows · MSI in Spanish',
        dmg: 'macOS · universal',
        deb: 'Linux · Debian and Ubuntu',
        AppImage: 'Linux · other distributions',
        rpm: 'Linux · Fedora and RHEL',
      },
      recommended: 'recommended',
      copy: 'Copy',
      copied: 'Copied ✓',
      copyLabel: 'Copy the SHA256 of {file}',
      announce: 'Copied',
    },
    after: {
      eyebrow: 'After the download',
      title: 'First time? *Here is what comes next.*',
      lede: 'From nothing to seeing your city in three steps:',
      steps: [
        '**Install Vellum Bridge** in the game, from Steam Workshop.',
        '**Export your city:** in the game, press the Bridge button or [[Ctrl]] + [[Shift]] + [[E]]. It saves a `.vellummap`, one folder per city.',
        '**Open it in Vellum:** drop the `.vellummap` on the window or use [[Ctrl]] + [[O]].',
      ],
      cslmap:
        'Coming from CSL Map View? Vellum opens your `.cslmap` files too.',
      guide: 'Open the quick guide',
      changelog: "What's new in {version}",
      reminder: {
        tag: "Don't forget",
        title: 'Vellum Bridge, in the game',
        body: 'Without it, Vellum has nothing to open.',
        link: 'Go to step 2',
      },
    },
    mobile: {
      title: 'Vellum is *for desktop.*',
      lede: 'You install it on the PC where you play Cities: Skylines. Send yourself the link and download it there.',
      copy: 'Copy link',
      copied: 'Link copied ✓',
      announce: 'Link copied',
      share: 'Share…',
      fine: "Share opens your phone's menu. I don't keep anything.",
      address: 'The address:',
    },
  },
};
