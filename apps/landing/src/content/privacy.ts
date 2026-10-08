import type { Lang } from './routes';

/**
 * The privacy policy (EXPERIENCE.md · Páginas · Privacidad), with the name
 * «Vellum City Maps» as in the Store. `/privacy/` is the URL given to Partner
 * Center: a static page that never loads Google and is never redirected.
 * Section ids are English in both languages, so a language switch keeps the
 * hash.
 */
export interface PrivacyLink {
  href: string;
  label: string;
}

export interface PrivacySection {
  id: string;
  title: string;
  body: string;
  /** Links shown under the section, all external (or `mailto:`). */
  links: PrivacyLink[];
}

export interface PrivacyCopy {
  meta: { title: string; description: string };
  eyebrow: string;
  title: string;
  updated: string;
  intro: string;
  sections: PrivacySection[];
}

export const PRIVACY: Record<Lang, PrivacyCopy> = {
  en: {
    meta: {
      title: 'Privacy · Vellum',
      description:
        'Privacy policy for Vellum City Maps desktop and the Vellum website.',
    },
    eyebrow: 'Vellum City Maps',
    title: 'Privacy policy',
    updated: 'Last updated: October 8, 2026',
    intro:
      'Your cities stay on your computer. This policy distinguishes the desktop application from this website.',
    sections: [
      {
        id: 'desktop',
        title: 'Desktop application',
        body: 'Vellum processes maps locally on your device. It does not collect personal information, upload cities or map files, or send telemetry, analytics, or crash reports. No account is required.',
        links: [],
      },
      {
        id: 'store',
        title: 'Microsoft Store edition',
        body: 'Vellum itself makes no network requests when running as a Microsoft Store package. Its built-in updater is disabled. Microsoft Store and Windows may communicate with Microsoft to manage package updates separately, under Microsoft’s privacy statement.',
        links: [
          {
            href: 'https://privacy.microsoft.com/privacystatement',
            label: 'Microsoft privacy statement',
          },
        ],
      },
      {
        id: 'standalone',
        title: 'Standalone edition',
        body: 'The standalone application can check GitHub for updates at startup. You can disable this optional check in Preferences. Updates are downloaded and installed only after you explicitly choose to install them. GitHub receives your IP address and may process request metadata, such as browser or application information and the time of the request, under its privacy policy. These connections are used to check for and download releases; no cities or map files are included.',
        links: [
          {
            href: 'https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement',
            label: 'GitHub privacy policy',
          },
        ],
      },
      {
        id: 'files',
        title: 'Maps, exports, and desktop preferences',
        body: 'City files, map projects, PNG/SVG exports, preferences, and custom themes are stored locally. You choose which files to open and where to save exports. Store package preferences and custom themes are separate from those of a standalone installation and may be removed when the package is uninstalled. Keep backups of files and themes you want to retain.',
        links: [],
      },
      {
        id: 'website',
        title: 'Website analytics',
        body: 'Every page of the Vellum website except this privacy page uses Google Analytics 4 to measure website visits and usage. It loads only after you accept optional analytics in the consent banner. You can reject analytics or change your choice at any time using Analytics preferences. Advertising consent remains denied. Google Signals is disabled and no Google Ads account is linked. Google may process cookies, identifiers, device/browser details and usage information. Google receives your IP address through the connection; Google states that Analytics uses IP addresses to derive approximate location and does not log or store individual IP addresses from users in the EU, Switzerland or the UK. Processing elsewhere is governed by Google’s policies. Website analytics is separate from the desktop application. This privacy page does not load Google Analytics or its own analytics scripts. You can restrict cookies through your browser or use Google’s Analytics opt-out add-on in supported browsers. Blocking cookies alone may not prevent all analytics requests.',
        links: [
          {
            href: 'https://tools.google.com/dlpage/gaoptout',
            label: 'Google Analytics opt-out add-on',
          },
          {
            href: 'https://policies.google.com/technologies/partner-sites',
            label: 'How Google uses data from partner sites',
          },
          {
            href: 'https://policies.google.com/privacy',
            label: 'Google privacy policy',
          },
        ],
      },
      {
        id: 'preferences',
        title: 'Website preferences',
        body: "The website stores your language and theme choices in browser local storage (vellum-landing-language and vellum-page-theme). These preferences stay in your browser and are not sent by Vellum to a server. You can clear them using your browser's site data controls. It also keeps a session marker in session storage (vellum-landing-session) that only records whether this is the first page of your visit, to decide the language redirect; it is deleted when you close the tab and is never sent anywhere. Your analytics choice is stored locally under vellum-analytics-consent-v1. If storage is unavailable, it applies only to the current page. Withdrawing acceptance stops future analytics on this site and removes accessible Google Analytics cookies; the page reloads to unload the tag.",
        links: [],
      },
      {
        id: 'retention',
        title: 'Retention and deletion',
        body: 'Vellum maintains no server-side accounts or copies of your cities, maps, exports, desktop preferences or themes. Local files remain until you delete them. Remove application preferences and themes by clearing the application’s local data; uninstalling may remove package data but does not necessarily delete files you saved elsewhere. Clearing this website’s browser data removes its language and theme preferences. The Google Analytics property is configured to retain event data for 2 months and user data for 14 months. Resetting user data retention on new activity is enabled: a new visit can restart the 14-month period for that user identifier, so it is not an absolute limit from the first visit. These limits apply to user- and event-level data covered by the retention settings, not standard aggregated reports. Clearing browser data or withdrawing consent does not delete analytics data already received by Google.',
        links: [],
      },
      {
        id: 'rights',
        title: 'Your privacy rights',
        body: 'Depending on the law applicable to you, you may have rights to access, correct, delete or receive your personal data, restrict or object to its processing, withdraw consent where processing relies on it, and complain to a data protection authority. You control the desktop’s local files and preferences directly; the developer cannot access or delete them remotely. For website-related requests, use the contact information below. Data handled independently by GitHub, Google or Microsoft is also subject to their privacy policies and request procedures.',
        links: [],
      },
      {
        id: 'children',
        title: 'Children’s privacy',
        body: 'Vellum does not require an account or ask desktop users for personal information, including age. The project does not knowingly request personal information from children. Avoid posting a child’s personal information in public GitHub issues. Website analytics and third-party services are described separately above.',
        links: [],
      },
      {
        id: 'changes',
        title: 'Changes to this policy',
        body: 'Updates to this policy will be published on this page with a revised last-updated date. Material changes to Vellum’s data handling will also be described in the project’s release notes. Review this page when updating the application or using the website.',
        links: [
          {
            href: 'https://github.com/sebas-tcotd/vellum/releases',
            label: 'Project release notes',
          },
        ],
      },
      {
        id: 'contact',
        title: 'Responsible developer and contact',
        body: 'Vellum City Maps is developed and maintained by Sebastian Vargas Pizango, who is responsible for the project’s data handling described here. For privacy questions or requests, email vargaspizango1@gmail.com. Your email address and the information you send are used to respond to your request. Send only the details necessary to handle it. General, non-sensitive questions can also be raised in the project’s GitHub repository. GitHub issues are public: do not include sensitive personal information, private city files or identification documents. Information you choose to post on GitHub is handled under its privacy policy.',
        links: [
          {
            href: 'mailto:vargaspizango1@gmail.com',
            label: 'Email the developer about privacy',
          },
          {
            href: 'https://github.com/sebas-tcotd/vellum/issues',
            label: 'General questions on GitHub',
          },
          {
            href: 'https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement',
            label: 'GitHub privacy policy',
          },
        ],
      },
    ],
  },
  es: {
    meta: {
      title: 'Privacidad · Vellum',
      description:
        'Política de privacidad de Vellum City Maps para escritorio y del sitio web de Vellum.',
    },
    eyebrow: 'Vellum City Maps',
    title: 'Política de privacidad',
    updated: 'Última actualización: 8 de octubre de 2026',
    intro:
      'Tus ciudades permanecen en tu equipo. Esta política distingue la aplicación de escritorio de este sitio web.',
    sections: [
      {
        id: 'desktop',
        title: 'Aplicación de escritorio',
        body: 'Vellum procesa los mapas localmente en tu dispositivo. No recoge información personal, no sube ciudades ni archivos de mapas y no envía telemetría, analíticas o informes de errores. No necesitas una cuenta.',
        links: [],
      },
      {
        id: 'store',
        title: 'Edición de Microsoft Store',
        body: 'Vellum no realiza solicitudes de red por sí mismo cuando se ejecuta como paquete de Microsoft Store. Su actualizador integrado está desactivado. Microsoft Store y Windows pueden comunicarse con Microsoft para gestionar las actualizaciones del paquete por separado, conforme a la declaración de privacidad de Microsoft.',
        links: [
          {
            href: 'https://privacy.microsoft.com/privacystatement',
            label: 'Declaración de privacidad de Microsoft',
          },
        ],
      },
      {
        id: 'standalone',
        title: 'Edición independiente',
        body: 'La aplicación independiente puede comprobar si hay actualizaciones en GitHub al iniciarse. Puedes desactivar esta comprobación opcional en Preferencias. Las actualizaciones solo se descargan e instalan después de que elijas instalarlas expresamente. GitHub recibe tu dirección IP y puede tratar metadatos de las solicitudes, como información del navegador o la aplicación y la hora de la solicitud, conforme a su política de privacidad. Estas conexiones sirven para comprobar y descargar versiones; no incluyen ciudades ni archivos de mapas.',
        links: [
          {
            href: 'https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement',
            label: 'Política de privacidad de GitHub',
          },
        ],
      },
      {
        id: 'files',
        title: 'Mapas, exportaciones y preferencias de escritorio',
        body: 'Los archivos de ciudades, proyectos de mapas, exportaciones PNG/SVG, preferencias y temas personalizados se guardan localmente. Tú eliges qué archivos abrir y dónde guardar las exportaciones. Las preferencias y los temas personalizados del paquete de Store están separados de los de una instalación independiente y pueden eliminarse al desinstalar el paquete. Conserva copias de los archivos y temas que quieras mantener.',
        links: [],
      },
      {
        id: 'website',
        title: 'Analítica del sitio web',
        body: 'Todas las páginas del sitio de Vellum, salvo esta página de privacidad, utilizan Google Analytics 4 para medir las visitas y el uso del sitio. Solo se carga después de que aceptes la analítica opcional en el aviso de consentimiento. Puedes rechazarla o cambiar tu elección en cualquier momento desde Preferencias de analítica. El consentimiento publicitario permanece denegado. Google Signals está desactivado y no hay ninguna cuenta de Google Ads vinculada. Google puede tratar cookies, identificadores, detalles del dispositivo y navegador e información de uso. Google recibe tu dirección IP mediante la conexión; según Google, Analytics utiliza las direcciones IP para obtener una ubicación aproximada y no registra ni almacena las direcciones IP individuales de usuarios en la UE, Suiza o el Reino Unido. El tratamiento en otras regiones se rige por las políticas de Google. La analítica web es independiente de la aplicación de escritorio. Esta página de privacidad no carga Google Analytics ni scripts propios de analítica. Puedes restringir las cookies en tu navegador o utilizar el complemento de inhabilitación de Google Analytics en navegadores compatibles. Bloquear solo las cookies puede no impedir todas las solicitudes de analítica.',
        links: [
          {
            href: 'https://tools.google.com/dlpage/gaoptout',
            label: 'Complemento de inhabilitación de Google Analytics',
          },
          {
            href: 'https://policies.google.com/technologies/partner-sites',
            label: 'Cómo utiliza Google los datos de sitios asociados',
          },
          {
            href: 'https://policies.google.com/privacy',
            label: 'Política de privacidad de Google',
          },
        ],
      },
      {
        id: 'preferences',
        title: 'Preferencias del sitio web',
        body: 'El sitio guarda tus elecciones de idioma y tema en el almacenamiento local del navegador (vellum-landing-language y vellum-page-theme). Estas preferencias permanecen en tu navegador y Vellum no las envía a un servidor. Puedes borrarlas desde los controles de datos del sitio de tu navegador. También guarda una marca de sesión en el almacenamiento de sesión (vellum-landing-session) que solo indica si es la primera página de tu visita, para decidir la redirección de idioma; se borra al cerrar la pestaña y nunca se envía a ningún sitio. Tu elección de analítica se guarda localmente con la clave vellum-analytics-consent-v1. Si el almacenamiento no está disponible, solo se aplica a la página actual. Retirar la aceptación detiene la analítica futura en este sitio y elimina las cookies accesibles de Google Analytics; la página se recarga para descargar el script.',
        links: [],
      },
      {
        id: 'retention',
        title: 'Conservación y eliminación',
        body: 'Vellum no mantiene cuentas en servidores ni copias remotas de tus ciudades, mapas, exportaciones, preferencias de escritorio o temas. Los archivos locales permanecen hasta que los eliminas. Para borrar preferencias y temas, elimina los datos locales de la aplicación; desinstalar puede eliminar los datos del paquete, pero no necesariamente los archivos que guardaste en otras ubicaciones. Borrar los datos de este sitio en el navegador elimina sus preferencias de idioma y tema. La propiedad de Google Analytics está configurada para conservar los datos de eventos durante 2 meses y los datos de usuario durante 14 meses. Está activado el reinicio de la retención de datos de usuario con nueva actividad: una nueva visita puede reiniciar el plazo de 14 meses para ese identificador de usuario, por lo que no es un límite absoluto desde la primera visita. Estos plazos se aplican a los datos de usuario y evento sujetos a la configuración de retención, no a los informes agregados estándar. Borrar los datos del navegador o retirar el consentimiento no elimina los datos de analítica que Google ya recibió.',
        links: [],
      },
      {
        id: 'rights',
        title: 'Tus derechos de privacidad',
        body: 'Según la legislación que te sea aplicable, puedes tener derecho a acceder, rectificar, eliminar o recibir tus datos personales, limitar su tratamiento u oponerte a él, retirar el consentimiento cuando el tratamiento se base en este y reclamar ante una autoridad de protección de datos. Tú controlas directamente los archivos y preferencias locales de la aplicación; el desarrollador no puede acceder a ellos ni eliminarlos de forma remota. Para solicitudes relacionadas con el sitio web, utiliza la información de contacto que aparece abajo. Los datos tratados de forma independiente por GitHub, Google o Microsoft también están sujetos a sus políticas de privacidad y procedimientos de solicitud.',
        links: [],
      },
      {
        id: 'children',
        title: 'Privacidad de menores',
        body: 'Vellum no exige una cuenta ni solicita información personal a quienes utilizan la aplicación de escritorio, incluida su edad. El proyecto no solicita a sabiendas información personal de menores. Evita publicar información personal de menores en los issues públicos de GitHub. La analítica web y los servicios de terceros se describen por separado arriba.',
        links: [],
      },
      {
        id: 'changes',
        title: 'Cambios en esta política',
        body: 'Las actualizaciones de esta política se publicarán en esta página con una nueva fecha de última actualización. Los cambios importantes en el tratamiento de datos de Vellum también se describirán en las notas de versión del proyecto. Revisa esta página al actualizar la aplicación o utilizar el sitio web.',
        links: [
          {
            href: 'https://github.com/sebas-tcotd/vellum/releases',
            label: 'Notas de versión del proyecto',
          },
        ],
      },
      {
        id: 'contact',
        title: 'Desarrollador responsable y contacto',
        body: 'Vellum City Maps es desarrollado y mantenido por Sebastian Vargas Pizango, responsable del tratamiento de datos del proyecto descrito aquí. Para consultas o solicitudes de privacidad, escribe a vargaspizango1@gmail.com. Tu dirección de correo y la información que envíes se utilizan para responder a tu solicitud. Envía solo los detalles necesarios para atenderla. También puedes plantear consultas generales, sin datos sensibles, en el repositorio del proyecto en GitHub. Los issues de GitHub son públicos: no incluyas información personal sensible, archivos privados de ciudades ni documentos de identidad. La información que decidas publicar en GitHub se trata conforme a su política de privacidad.',
        links: [
          {
            href: 'mailto:vargaspizango1@gmail.com',
            label: 'Contactar por correo sobre privacidad',
          },
          {
            href: 'https://github.com/sebas-tcotd/vellum/issues',
            label: 'Consultas generales en GitHub',
          },
          {
            href: 'https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement',
            label: 'Política de privacidad de GitHub',
          },
        ],
      },
    ],
  },
};
