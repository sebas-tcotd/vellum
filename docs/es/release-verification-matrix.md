# Matriz de verificación de release

- [English](../en/release-verification-matrix.md)
- [Volver al índice en español](index.md)

Qué se verifica automáticamente antes de poder publicar una release, qué queda
como comprobación humana, y por qué la línea cae donde cae.

## El gate

[`e2e-golden-flow.yml`](../../.github/workflows/e2e-golden-flow.yml) es un
workflow reutilizable invocado desde dos lugares:

- [`ci.yml`](../../.github/workflows/ci.yml) — cada pull request y cada push a
  `main`.
- [`publish-release.yml`](../../.github/workflows/publish-release.yml) — en un
  tag `v*`, antes de que cualquier plataforma empiece a compilar y otra vez como
  prerrequisito del paso de publicación.

Es bloqueante, no informativo. Si el flujo dorado falla, `build-release` nunca
arranca y `finalize-release` nunca pasa el draft a publicado.

Se invoca dos veces a propósito: un tag puede apuntar a un commit que nunca pasó
por `ci.yml`, así que la evidencia se produce sobre el artefacto que realmente se
va a publicar y no sobre una promesa anterior.

## Qué corre automáticamente

| Verificación                                  | Dónde                    | Qué prueba                                                                                                                   |
| --------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Flujo dorado (abrir → listo → exportar)       | CI Linux                 | El binario compilado abre un `.cslmap` pasado por argv, lo renderiza y el `ExportDialog` real escribe el PNG que anunció.    |
| Cancelación de export                         | CI Linux                 | Un export cancelado no publica archivo y no deja `.vellum-export-*.part` huérfano.                                           |
| Regresión visual de superficie y shell        | CI Linux                 | El mapa renderizado y el chrome del shell coinciden con los baselines dentro del umbral versionado de los goldens de export. |
| Perfiles de shell (`windows`/`macos`/`linux`) | CI Linux                 | Cada perfil produce un shell visiblemente distinto.                                                                          |
| Compile check                                 | CI Windows, macOS, Linux | El shell Rust sigue compilando en las tres plataformas (`compile-matrix` en `ci.yml`).                                       |
| Bundle, firma y manifiesto de updater         | CI Windows, macOS, Linux | Los instaladores se construyen, se firman y el manifiesto del updater resuelve (`publish-release.yml`).                      |

La suite conduce el **binario de release compilado** con `tauri-driver` y
`webdriverio` usado como librería, así que ejercita el WebView real, el límite
IPC real y el pipeline de export real. Nunca apunta un navegador aparte al
devUrl de Vite — eso hacía la configuración anterior de Playwright, y verificaba
el frontend en Chromium sin probar nada de la aplicación.

## Qué queda manual

| Plataforma | Por qué no se automatiza                                                                                                                                              | Qué revisa una persona                                                                                       |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| macOS      | Tauri v2 **no publica una implementación de WebDriver para WKWebView**. No hay driver que ejecutar, así que un runner macOS no es conducible; simularlo sería teatro. | Abrir un `.cslmap` desde Finder, exportar y confirmar chrome de ventana, vibrancy y comportamiento de menús. |
| Windows    | `tauri-driver` sí puede conducir WebView2 vía `msedgedriver`, pero un runner Windows todavía no forma parte de este gate (extenderlo es una decisión aparte).         | El mismo recorrido, más la asociación de archivos `.cslmap` que instala el MSI.                              |

Los tres perfiles de shell sí se cubren en Linux, porque los selecciona
`data-platform` en `<html>` y no el sistema operativo anfitrión. Eso verifica los
**sets de tokens** — Fluent 2, Liquid Glass, neutral — no los materiales nativos
que cada OS compone de verdad. Un `shell-macos.png` verde dice que los tokens de
Liquid Glass se aplicaron; no dice que macOS se vea bien. La distinción está
repetida en [el README de baselines](../../apps/desktop/tests/e2e/baselines/README.md)
para que un baseline verde nunca se lea como más de lo que es.

## Ejecutar el flujo dorado en local

```bash
cargo install tauri-driver --locked     # una vez
pnpm --filter @vellum/desktop build     # el binario de release bajo prueba
pnpm test:e2e
```

En Linux hacen falta además `webkit2gtk-driver` (que provee `WebKitWebDriver`)
y, en una máquina sin display, `xvfb-run`. En macOS la suite no puede correr,
por la razón de arriba.

La corrida redirige el directorio de descargas de la app (`XDG_DOWNLOAD_DIR` y
`HOME`) a un árbol temporal descartable, así que nada de lo que exporta llega a
la carpeta de Descargas real; el temporal y el proceso `tauri-driver` se
destruyen pase o falle la corrida.

`pnpm test` **no** ejecuta nada de esto: las suites unitarias siguen siendo
herméticas y nunca arrancan la app. El flujo dorado es un comando aparte con
prerrequisitos aparte.
