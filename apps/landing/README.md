# @vellum/landing

Landing page estática de Vellum, separada de la app de escritorio y de la
documentación técnica en `docs/`.

## Desarrollo local

```bash
pnpm --filter @vellum/landing dev
pnpm --filter @vellum/landing build
pnpm --filter @vellum/landing lint
```

## GitHub Pages

El workflow [`deploy-pages.yml`](../../.github/workflows/deploy-pages.yml)
compila `dist/` y lo publica usando GitHub Actions. En GitHub, la configuración
del repositorio debe tener `Settings → Pages → Source: GitHub Actions`.
