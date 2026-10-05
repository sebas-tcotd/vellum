# @vellum/landing

Landing page estática de Vellum, separada de la app de escritorio y de la
documentación técnica en `docs/`. Se compila con [Astro](https://astro.build)
en salida estática y se publica en GitHub Pages bajo la base `/vellum/`
(`https://sebas-tcotd.github.io/vellum/`).

## Desarrollo local

Requiere Node 22.12 o posterior.

```bash
pnpm --filter @vellum/landing dev          # servidor de desarrollo de Astro
pnpm --filter @vellum/landing build        # genera dist/
pnpm --filter @vellum/landing preview      # sirve dist/ bajo /vellum/
pnpm --filter @vellum/landing lint         # astro check + tsc --noEmit
pnpm --filter @vellum/landing test:static  # Playwright contra dist/
```

`test:static` necesita un build previo y Chromium de Playwright
(`pnpm --filter @vellum/landing exec playwright install chromium`). Sirve
`dist/` en `http://127.0.0.1:4178/vellum/` como GitHub Pages: redirige los
directorios sin barra final, responde `404.html` con estado 404 y no tiene
fallback de SPA.

## Estructura

- `astro.config.mjs`: salida estática, `base: '/vellum/'`, URLs de directorio
  con barra final, i18n (inglés en la raíz, español bajo `/es/`), integración
  de React y Tailwind 4 como plugin de Vite.
- `src/layouts/BaseLayout.astro`: `<html lang>`, meta, `canonical`, `hreflang`
  (solo en páginas con par en el otro idioma), `og:image` absoluto y favicon.
- `src/pages/`: `index.astro` (home), `privacy/index.astro` y `404.astro`.
  `/es/` está configurado en el enrutado, todavía sin páginas.
- `src/islands/`: la home y la privacidad actuales (`App`, `Privacy`) y la barra
  de consentimiento se montan como islas `client:only="react"`, después de
  inicializar i18n.
- `src/i18n.ts`, `i18n/*.json`: idioma por `?lang=`, la clave
  `vellum-landing-language` y el navegador.
- `src/analytics.ts`: consentimiento de GA4; `/privacy/` nunca lo carga.
- `src/data/release.ts`: datos del release al compilar. Elige el release de
  mayor semver `v<semver>` (sin borradores ni prereleases) y cada instalador por
  patrón de nombre. Con `CI=true` lee la API de GitHub con `GITHUB_TOKEN` y, si
  falla, el build falla; fuera de CI usa `release.fixture.json`.
  `LANDING_RELEASE_SOURCE=live|fixture` fuerza uno de los dos.
- `src/components/DownloadBand.astro`: la banda `#download` con enlaces directos
  por plataforma en el HTML servido. La home la mueve a su sitio desde la isla
  (`DownloadSlot` en `App.tsx`) hasta que las páginas nuevas del paso 5 la
  rendericen en Astro.
- `public/`: assets servidos tal cual bajo `/vellum/`.
- `tests/`: Playwright (rutas y URLs duras, consentimiento, privacidad) y el
  servidor estático.

## URLs duras

- `/vellum/#download`: la enlazan las versiones publicadas de Vellum Bridge; la
  home debe tener siempre un elemento `id="download"`.
- `/vellum/privacy` y `/vellum/privacy/`: URL entregada a Partner Center;
  página estática sin GA y sin redirección por idioma.

## GitHub Pages

El workflow [`deploy-pages.yml`](../../.github/workflows/deploy-pages.yml)
se dispara con cambios en la landing y al terminar con éxito _Publish Release_ (así la banda `#download` toma el release nuevo); compila `dist/`, lo publica usando GitHub Actions y comprueba el sitio
desplegado (home, privacidad con y sin barra, 404 y que los assets referenciados
en el HTML servido resuelvan bajo `/vellum/`). Las imágenes que crean las islas
en el cliente no aparecen en ese HTML: solo las comprueban los tests de
Playwright. En GitHub, la configuración del repositorio debe tener
`Settings → Pages → Source: GitHub Actions`.
