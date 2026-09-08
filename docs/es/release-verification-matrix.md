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

| Verificación                                  | Dónde                    | Qué prueba                                                                                                                                                                               |
| --------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Flujo dorado (abrir → listo → exportar)       | CI Linux                 | El binario compilado abre un `.cslmap` pasado por argv, lo renderiza y el `ExportDialog` real escribe el PNG que anunció.                                                                |
| Cancelación de export                         | CI Linux                 | Un export cancelado no publica archivo y no deja `.vellum-export-*.part` huérfano.                                                                                                       |
| Regresión visual de superficie y shell        | CI Linux                 | El mapa renderizado y el chrome del shell coinciden con los baselines dentro del umbral versionado de los goldens de export.                                                             |
| Perfiles de shell (`windows`/`macos`/`linux`) | CI Linux                 | Cada perfil produce un shell visiblemente distinto.                                                                                                                                      |
| Compile check                                 | CI Windows, macOS, Linux | El shell Rust sigue compilando en las tres plataformas (`compile-matrix` en `ci.yml`).                                                                                                   |
| Bundle y manifiesto de updater                | CI Windows, macOS, Linux | Los instaladores se construyen, sus artefactos de updater se firman y el `latest.json` publicado resuelve y valida (`publish-release.yml`).                                              |
| Firma Authenticode de Windows                 | CI Windows               | **Sólo si hay certificado configurado.** Con él, se verifica la firma del MSI y una inválida hace fallar el release. Sin él, el release se publica igual y la ausencia queda registrada. |
| Asset de evidencia de firmado                 | CI Linux                 | Cada release lleva `signing-evidence.md` diciendo, por plataforma, si el instalador está firmado y si lo está su artefacto de updater (`publish-release.yml`).                           |
| Guardrail de superficie de red                | CI Linux                 | `pnpm check:network` — nada de red de navegador en producción, ningún crate HTTP, CSP y capabilities sin cambiar. Bloqueante.                                                            |
| Guardrail de identidad de instalador          | CI Linux                 | `pnpm check:installer` — metadatos contra `brand/`, artwork derivado y bien dimensionado, la asociación `.cslmap` opt-in intacta y ningún script de instalación. Bloqueante.             |
| Auditoría de dependencias                     | CI Linux                 | `pnpm audit:deps` reporta advisories de JavaScript y de Rust. **Informativa — nunca bloquea.**                                                                                           |

La suite conduce el **binario de release compilado** con `tauri-driver` y
`webdriverio` usado como librería, así que ejercita el WebView real, el límite
IPC real y el pipeline de export real. Nunca apunta un navegador aparte al
devUrl de Vite — eso hacía la configuración anterior de Playwright, y verificaba
el frontend en Chromium sin probar nada de la aplicación.

Ojo con lo que las filas de firmado **no** afirman. macOS hoy no se firma nunca:
`tauri.conf.json` no declara `signingIdentity`. (El pipeline ya no reempaqueta el
DMG después del build —ese paso se retiró en la Story 1.9— así que esa segunda
razón desapareció; la ausencia de firma sigue siendo deliberada.) Windows se firma sólo si
hay certificado configurado. Ninguna de las dos ausencias bloquea el release:
ambas quedan registradas en el asset `signing-evidence.md` y advertidas en las
notas. El razonamiento está en
[Seguridad y privacidad](security-and-privacy.md), y qué se puede personalizar de
cada instalador, en [Empaquetado e instaladores](packaging-and-installers.md).

## Qué queda manual

| Plataforma                   | Por qué no se automatiza                                                                                                                                                                                        | Qué revisa una persona                                                                                                                                                                                                                                                                          |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| macOS                        | Tauri v2 **no publica una implementación de WebDriver para WKWebView**. No hay driver que ejecutar, así que un runner macOS no es conducible; simularlo sería teatro.                                           | Abrir un `.cslmap` desde Finder, exportar y confirmar chrome de ventana, vibrancy y comportamiento de menús.                                                                                                                                                                                    |
| Windows                      | `tauri-driver` sí puede conducir WebView2 vía `msedgedriver`, pero un runner Windows todavía no forma parte de este gate (extenderlo es una decisión aparte).                                                   | El mismo recorrido, más la asociación de archivos `.cslmap` que instala el MSI.                                                                                                                                                                                                                 |
| macOS — DMG                  | El bundler de DMG coloca iconos y fondo conduciendo Finder por AppleScript. En un runner headless eso es inestable y puede saltarse en silencio: el build reporta éxito con la ventana en el default de Finder. | Montar el `.dmg`, confirmar fondo Vellum, tamaño de ventana y las posiciones de la app y del alias de Aplicaciones, y que no aparece ningún archivo de readme suelto.                                                                                                                           |
| Windows — instalación limpia | Ningún runner de CI instala de verdad: verificar un MSI exige una máquina limpia, y la reputación de SmartScreen depende de telemetría de base instalada que un runner no produce.                              | Instalar el MSI: editor, icono, banner y textos de Vellum; el checkbox de `.cslmap` desmarcado por defecto; desinstalar y comprobar que no queda la asociación y que mapas, temas y preferencias sobreviven. Repetir el recorrido con el `.exe` de NSIS (sin asociación: es exclusiva del MSI). |
| Linux — instalación limpia   | Un `dpkg -i` en un contenedor no tiene entorno de escritorio, y lo que hay que ver es exactamente lo que dibuja el lanzador.                                                                                    | Instalar el `.deb` y el `.rpm` en un escritorio real y buscar Vellum en el lanzador: icono, nombre, comentario en el idioma del sistema y categoría. Desinstalar y comprobar que mapas, temas y preferencias sobreviven.                                                                        |

### El smoke de CSP

El flujo dorado ejercita la Content-Security-Policy sólo en Linux, sobre
WebKitGTK. Las dos directivas con más probabilidad de diferir entre motores
—`worker-src`/`child-src` con `blob:`, de las que depende el worker pool de
MapLibre— son justo las que un solo motor no puede avalar: WebView2 (Windows) y
WKWebView (macOS) las implementan distinto, y WebKit históricamente no ha
respetado `worker-src`. Así que en un release candidate, en **cada** uno de
Windows y macOS, con la consola de la WebView abierta:

1. Abrir un `.cslmap` grande y confirmar que el mapa se dibuja en vez de quedar
   en blanco — un mapa en blanco es la firma de un worker bloqueado.
2. Abrir el panel de capas y algún diálogo (Preferencias, Acerca de) — un
   `style-src` roto se ve como contenido modal sin estilos o invisible.
3. Exportar un PNG y exportar un SVG — ambos caminos tocan a la vez un worker,
   un `blob:` y un `data:` URI.
4. Confirmar que la consola **no** reporta ninguna violación de CSP.

Una violación es un bug de la política, no una razón para relajarla a
`'unsafe-eval'`: hay que encontrar la directiva que la evidencia realmente exige
y dejarla registrada en [Seguridad y privacidad](security-and-privacy.md).

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
pnpm --filter @vellum/desktop exec tauri build --no-bundle     # el binario de release bajo prueba
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
