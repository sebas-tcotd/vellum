# @vellum/landing

Landing page estática de Vellum, separada de la app de escritorio y de la
documentación técnica en `docs/`. Se compila con [Astro](https://astro.build)
en salida estática y se publica en GitHub Pages bajo la base `/vellum/`
(`https://sebas-tcotd.github.io/vellum/`).

## Desarrollo local

Requiere Node 22.12 o posterior.

```bash
pnpm --filter @vellum/landing dev          # servidor de desarrollo de Astro
pnpm --filter @vellum/landing build        # compila @vellum/core y genera dist/
pnpm --filter @vellum/landing preview      # sirve dist/ bajo /vellum/
pnpm --filter @vellum/landing lint         # astro check + tsc --noEmit
pnpm --filter @vellum/landing shots:report # tomas y datos que faltan para lanzar
pnpm --filter @vellum/landing test:static  # Playwright contra dist/
```

`test:static` necesita un build previo y Chromium de Playwright
(`pnpm --filter @vellum/landing exec playwright install chromium`). Sirve
`dist/` en `http://127.0.0.1:4178/vellum/` como GitHub Pages: redirige los
directorios sin barra final, responde `404.html` con estado 404 y no tiene
fallback de SPA.

## Estructura

- `astro.config.mjs`: salida estática, `base: '/vellum/'`, URLs de directorio
  con barra final, i18n (inglés en la raíz, español bajo `/es/`), React,
  Tailwind 4 (solo para el CSS de los componentes embebidos y la privacidad
  vieja) y el alias de `@vellum/core` a su `dist`.
- `src/pages/`: `index.astro` y `es/index.astro` (home v1.0),
  `privacy/index.astro` y `404.astro` (diseño anterior, con
  `BaseLayout.astro`).
- `src/layouts/SiteLayout.astro`: documento de las páginas v1.0. En el
  `<head>`, antes del CSS, un script en línea aplica el tema guardado y las
  reglas de idioma (`src/scripts/language.ts`, función pura probada en
  `tests/language.spec.mjs`); después, enlace de salto, consentimiento, nav,
  `<main id="contenido">` y footer (`src/components/site/`).
- `src/content/`: rutas y páginas publicadas (`routes.ts`; la nav solo enlaza
  a las que están en `PUBLISHED_PAGES`), enlaces externos (`links.ts`), textos
  de la base (`site.ts`) y de la home (`home.ts`), ciudades con su crédito
  (`cities.ts`) y el registro de tomas (`shots.ts`).
- `src/components/home/`: una sección Astro por bloque de la home; la
  interacción (tira de capas, comparador y fichas, lightbox, Nocturno, menú,
  tema y consentimiento) va en scripts sin framework.
- `src/components/app-embed/`: componentes reales de la app renderizados en
  build dentro de Declarative Shadow DOM (ver `spike/REPORT.md`).
- `src/data/release.ts`: datos del release al compilar. Elige el release de
  mayor semver `v<semver>` (sin borradores ni prereleases) y cada instalador por
  patrón de nombre. Con `CI=true` lee la API de GitHub con `GITHUB_TOKEN` y, si
  falla, el build falla; fuera de CI usa `release.fixture.json`.
  `LANDING_RELEASE_SOURCE=live|fixture` fuerza uno de los dos.
- `src/components/DownloadBand.astro`: la banda `#download` de la home, con
  enlaces directos por plataforma en el HTML servido.
- `src/islands/`, `src/Privacy.tsx`, `src/i18n.ts`, `i18n/*.json`: la
  privacidad del diseño anterior, hasta que llegue su página nueva.
- `public/`: assets servidos tal cual bajo `/vellum/`.
- `tests/`: Playwright (rutas y URLs duras, home, idioma, consentimiento,
  privacidad) y el servidor estático.

## Tomas

Las imágenes de la home salen del registro `src/content/shots.ts` (ciudad,
proporción, `alt` y, si hace falta, recorte o fondo de cada toma). Los PNG
originales viven fuera del repo, en `imports/tomas/` del workspace UX; se
importan como WebP optimizado:

```bash
pnpm --filter @vellum/landing shots:import "<carpeta con los PNG>"
```

El import aplica el recorte del registro, quita márgenes y sombras
transparentes de las capturas de ventana, pone sobre su fondo los exports
translúcidos (Transit con «Atenuar otras capas») y deja como mucho 3200 px de
ancho en `src/assets/shots/`; el build genera los tamaños responsive. Si falta
una toma, la página muestra un marcador rayado con su id. `shots:report` lista
lo que queda.

## URLs duras

- `/vellum/#download`: la enlazan las versiones publicadas de Vellum Bridge; la
  home debe tener siempre un elemento `id="download"`.
- `/vellum/privacy` y `/vellum/privacy/`: URL entregada a Partner Center;
  página estática sin GA y sin redirección por idioma.

## GitHub Pages

El workflow [`deploy-pages.yml`](../../.github/workflows/deploy-pages.yml)
se dispara con cambios en la landing y al terminar con éxito _Publish Release_ (así la banda `#download` toma el release nuevo); compila `dist/`, lo publica usando GitHub Actions y comprueba el sitio
desplegado (home, privacidad con y sin barra, 404 y que los assets referenciados
en el HTML servido resuelvan bajo `/vellum/`). En GitHub, la configuración del repositorio debe tener
`Settings → Pages → Source: GitHub Actions`.
