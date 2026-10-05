# Backlog del rediseño de la landing v1.0

Tareas que salieron del diseño UX de la landing v1.0 (2026-10-05) pero que no
son trabajo de la landing: arreglos de producto, trabajo de release y la
actualización del `DESIGN.md` raíz. No es la especificación de la landing: esa
vive en el workspace UX del repositorio privado de planificación
(`_bmad-output/planning-artifacts/ux-designs/ux-vellum-2026-10-04/`, con
`DESIGN.md` y `EXPERIENCE.md`).

Cada entrada dice **qué se encontró** y **qué cambiaría**. Las que bloquean
algo de la landing lo dicen.

## A. Hallazgos para producto

1. **La nota de fuente de la marginalia añade `.cslmap` a los mapas de Bridge.**
   `buildMarginaliaContent` (`packages/core/src/export/marginalia-layout.ts:630-635`)
   añade `.cslmap` a todo nombre que no termine en `.cslmap`, también a los
   `.vellummap`, así que la nota dice `ciudad.vellummap.cslmap`. Bug
   confirmado. **Bloquea** la lámina de la landing (Home 09 y manifiesto): hasta
   que se corrija, esa toma se exporta sin el bloque «Fuente y límites de los
   datos».
2. **«Atenuar otras capas» en Transit lava el resto a gris claro**, en lugar de
   oscurecerlo. Verificarlo con la toma de v1.0; la copy de la landing ya dice
   «el resto del mapa se retira a un gris tenue». Si producto cambia el
   comportamiento para oscurecer, hay que actualizar esa frase de la landing.
3. ~~**Los workflows de release no publican SHA256.**~~ Ya no hace falta: la API
   de releases de GitHub expone un `digest` SHA-256 por asset (verificado en
   `v0.14.0`). «Verificar la descarga» (`/download/#verify`) lo lee al compilar;
   no hay que tocar `publish-release.yml` (ver C1).
4. **La página de Bridge en Steam Workshop debe avisar que hace falta Vellum
   Desktop.** Material de la story 5.5.
5. **Build standalone del DLL de Bridge** para instalar sin Workshop. Trabajo de
   producto; mientras no exista, `/download/#bridge-manual` muestra el estado
   «Próximamente» en lugar del enlace al DLL.
6. **Docs desfasados sobre distribución y firma.**
   `docs/es/packaging-and-installers.md` dice «se distribuye por descarga, no por
   tienda», y el README afirma «Releases are configured for Authenticode
   signing», pero los releases salen sin firma. Actualizar los dos.

## B. Qué debería adoptar el `DESIGN.md` raíz

**Aplicada** en el [`DESIGN.md`](../../DESIGN.md) raíz (2026-10-05), con dos
decisiones de Sebas: el logo principal pasa a ser **V + rosa náutica** (la V
sola queda para tamaños pequeños), y la cursiva de DM Mono es **solo de la
landing** (la marginalia del export usa la redonda). Queda pendiente B8 y, como
cambio de producto aparte, alinear la tinta de texto de la app (B1).

Modelo C: un núcleo de marca común a la app y a la landing, más un delta por
superficie. Aplicar el núcleo al `DESIGN.md` raíz era **la primera tarea de la
implementación** de la landing (decisión de Sebas, 2026-10-05); ya está hecha.

1. La tinta de texto de marca es `#4A4035`. Hoy la app pinta el wordmark y el
   texto en `#333333`.
2. Documentar el coral `#D2938E` como color de marca, con su regla: nunca como
   texto ni como foco sobre papel (2,34:1).
3. Un oscuro **de marca** cálido (familia `#1F1B17`), separado del oscuro
   funcional azul-violeta de Transit.
4. Source Serif 4 como serif de lectura editorial (piezas largas, web). La UI de
   la app sigue en `system-ui`.
5. DM Mono Italic como voz de anotación de la landing, de la misma familia que
   la marginalia del export (que usa DM Mono redonda).
6. Las variantes de chrome por plataforma (Fluent, Liquid Glass, Linux) como
   delta de la app.
7. IM Fell English, registrada como reservada para usos futuros (p. ej., el
   timelapse post-v1).
8. Pendiente de una revisión de marca: el sistema de tamaños del logo y el logo
   pequeño (ver `DESIGN.md` del workspace UX · Brand & Style · Logo).

Alcance: es un PR **solo de documentación**. Cambiar la tinta de la app
(`packages/ui/src/styles/01-settings.css`, `#333333` → `#4A4035`) es un cambio
de producto aparte, con su propia regresión visual. No se crea un paquete de
tokens compartido (dos consumidores no lo justifican): la landing copia sus
tokens desde `DESIGN.md`.

## C. Decisiones de arquitectura (aprobadas por Sebas, 2026-10-05)

1. **Datos de descarga al compilar, no en el navegador.** Astro lee la API de
   releases de GitHub en build; el navegador solo detecta el SO y destaca
   enlaces que ya están en el HTML (sin JS se ven las tres plataformas).
   - El release se elige por etiqueta `v<semver>`, sin borradores ni
     prereleases, y cada asset por patrón (`*_x64-setup.exe`,
     `*_universal.dmg`, `*_amd64.deb`…), nunca por nombre fijo ni confiando a
     ciegas en `/releases/latest`.
   - Checksums: campo `digest` de cada asset (ver A3).
   - Redeploy: `deploy-pages.yml` se dispara con `workflow_run` sobre
     _publish-release_ cuando termina con éxito. `on: release: published` **no
     sirve**: el release se publica con `GITHUB_TOKEN`, que no dispara otros
     workflows.
   - Fallos: si la API falla, el build falla y Pages conserva el deploy
     anterior. Si falta el asset de una plataforma, se usa el estado «Datos del
     release no disponibles» de `EXPERIENCE.md`. En CI se usa `GITHUB_TOKEN`
     (límite de peticiones); en local, un fixture JSON commiteado.
2. **Componentes reales de la app: SSR sin hidratación dentro de Declarative
   Shadow DOM.** `AdvancedOptionsPanel` y `PlaceCard` solo dependen de props y
   `react-i18next`: islas React sin directiva `client:` (cero JS), con un
   `i18next.createInstance()` por idioma. El CSS va en un
   `packages/ui/src/embed.css` aparte (tokens, temas, componentes, utilidades;
   **sin** `03-generic.css`, que fija `body { min-width: 900px; overflow: hidden }`),
   con los tokens de `:root` llevados a `:host`. `@font-face` y los `@property`
   de Tailwind v4 se declaran en el documento, porque no funcionan dentro del
   shadow root. `data-platform`/`data-appearance` van en un `div` interno.
   **Antes:** spike de medio día con comparación Playwright contra la app; si
   falla, se usan las capturas de respaldo (T37, T35).
   **Spike hecho (2026-10-05): viable.** Las 6 comparaciones (panel y tarjeta ×
   `linux` claro, `macos` claro, `linux` oscuro) dan 0 % de píxeles distintos
   frente a una referencia con el `globals.css` completo, con el comparador y
   el umbral de los goldens; las pruebas de fuga también dan 0 %. Hizo falta
   que el bloque de tokens por defecto de `02-themes.css` se aplique a los
   cuatro perfiles de `data-platform`: con `:host` a secas, los tokens
   definidos con `var()` se resolvían en el host (la tarjeta macOS daba
   0,15 %, por debajo del umbral). Al pasar el envoltorio a `src/`, el
   `tsconfig` de la landing necesita `lib` ES2022 y `paths` propios para
   `@vellum/*`. Cifras y hallazgos: `apps/landing/spike/REPORT.md`; código y
   tests: `apps/landing/spike/`, `apps/landing/tests-spike/`.
3. **Orden de implementación:** (1) ~~`DESIGN.md` raíz (sección B)~~, hecho; (2)
   andamiaje Astro conservando `/vellum/#download` y `/vellum/privacy`, con
   tests, hecho; (3) ~~datos del release al compilar + workflow~~, hecho; (4)
   ~~spike de CSS de componentes~~, hecho (viable: componentes reales, sin las
   capturas T37/T35); (5) páginas.

## D. Ciudades de las tomas

Las ciudades de terceros del Workshop no tienen permiso explícito de sus
autores. El riesgo es de reputación ante la comunidad del lanzamiento, más que
técnico, y se concentra en la **ciudad vitrina** (unas 30 tomas), no en la
galería.

1. **Alternativas sin autor de la comunidad:** mapas incluidos en el juego
   (terreno vacío: requieren construir la ciudad) o escenarios de DLC que
   empiecen con ciudad (ya revisados: ver D3). Con ellas no hace falta
   pedir permiso a Paradox: el uso del juego es el mismo que en cualquier toma
   de Vellum. Se mantienen la nota de no afiliación y la regla de no usar logos
   ni arte oficial.
2. **Plan en paralelo:** (a) pedir permiso a un autor (opcional); (b) ~~revisar
   los escenarios de DLC como reserva~~, hecho (D3); (c) si nada sirve, construir una ciudad
   propia sobre un mapa del juego.
3. **Decidir la vitrina antes de la sesión de capturas.** Candidatas extraídas
   del juego base y de sus escenarios (2026-10-05): **Port Eden**,
   **Villebourg**, **Cormorant River** y **Peach Trees**, todas con
   `origen: 'juego'` y `permiso: 'no-aplica'`.
4. **Contenido declarativo:** cada ciudad en un archivo de contenido con
   `{ ciudad, autor?, origen: 'workshop' | 'propia' | 'juego', workshopId?, permiso: 'concedido' | 'pedido' | 'no' | 'no-aplica' }`.
   Un test de CI bloquea el deploy si la vitrina o el hero tienen una ciudad del
   Workshop sin `permiso: 'concedido'`. `autor` es obligatorio con `origen: 'workshop'` o `'propia'`; con `'juego'` se omite.
