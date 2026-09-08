# Postura de seguridad y privacidad

- [English](../en/security-and-privacy.md)
- [Volver al índice en español](index.md)

Qué cierra Vellum, qué deja abierto a propósito y dónde vive la evidencia de
cada afirmación. Cuatro garantías: una Content Security Policy real, un árbol de
dependencias auditado, una política de firmado honesta antes que cómoda, y una
superficie de red congelada en vez de simplemente observada.

## 1. Content Security Policy

La política se escribe una sola vez, en
[`apps/desktop/src-tauri/tauri.conf.json`](../../apps/desktop/src-tauri/tauri.conf.json)
bajo `app.security.csp`. Tauri la extiende en build con sus propios nonces de
script y el origen `ipc: http://ipc.localhost` — eso nunca se escribe a mano.

```
default-src 'self';
script-src 'self' blob:;
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
font-src 'self';
connect-src 'self' data:;
worker-src 'self' blob:;
child-src 'self' blob:;
object-src 'none';
frame-src 'none';
base-uri 'self';
form-action 'none'
```

Cada directiva permisiva la obliga algo que la app efectivamente carga. Ninguna
está por precaución:

| Directiva                          | Qué la obliga                                                                                                                                                                                                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `worker-src 'self' blob:`          | MapLibre arma su pool de workers con `URL.createObjectURL(new Blob(...))` (`packages/renderer-webgl/src/map-libre-renderer.ts`). `'self'` cubre además el worker por módulo que crea la ruta de export SVG en `apps/desktop/src/main.tsx`.                         |
| `child-src 'self' blob:`           | WebKit — el WebView de Linux y macOS — no siempre implementa `worker-src` y cae a `child-src`. Sin esto el mismo pool falla justo en las plataformas que no se pueden conducir en CI.                                                                              |
| `script-src 'self' blob:`          | El mismo pool: en algunos motores el script de un worker blob se pide bajo `script-src`.                                                                                                                                                                           |
| `style-src 'self' 'unsafe-inline'` | El único compromiso genuino — ver abajo.                                                                                                                                                                                                                           |
| `img-src 'self' data: blob:`       | Los iconos de servicio y el logo van inline como `data:` (`packages/core/src/service-icons.ts`, `packages/core/src/assets/vellum-logo.ts`); la captura del export PNG le pasa un `blob:` a MapLibre (`packages/renderer-webgl/src/capture/map-render-capture.ts`). |
| `connect-src 'self' data:`         | El protocolo DEM decodifica un tile de elevación embebido con `fetch()` sobre un `data:` URI (`packages/renderer-webgl/src/sources/dem-protocol.ts`). Acá no aparece ningún origen remoto, y el guardrail de abajo falla si alguna vez aparece.                    |
| `font-src 'self'`                  | Las reglas `@font-face` apuntan a `/assets/*.woff2` empaquetados (`packages/ui/src/styles/01-settings.css`); los glyphs del mapa son `.pbf` relativos en `apps/desktop/public/glyphs/`.                                                                            |

### Por qué `'unsafe-inline'` está en `style-src`

El Dialog de Radix arrastra `react-remove-scroll`, que inyecta un `<style>` en
runtime para bloquear el scroll del body. Busca un nonce en `__webpack_nonce__`,
que Vite no define, así que el elemento inyectado no lleva nonce y un
`style-src` estricto lo bloquea — y se lleva puestos todos los modales de la
app. Las alternativas son sustituir la primitiva Dialog o parchear una
dependencia transitiva; ninguna vale el riesgo en una aplicación local cuyos
únicos scripts salen de su propio bundle.

Los `style={{ … }}` de React **no** son motivo: van por CSSOM y nunca producen
un atributo `<style>` inline que la CSP inspeccione.

### Por qué `'unsafe-eval'` no está, y no va a estar

No hay `eval`, ni `new Function`, ni instanciación de `WebAssembly` en las
fuentes ni en el bundle compilado. `pnpm check:network` falla si `'unsafe-eval'`
aparece alguna vez en la política, así que volver a agregarlo es un acto
deliberado y no uno silencioso.

### El updater no va en `connect-src`

El chequeo de actualizaciones corre en Rust
(`apps/desktop/src-tauri/src/updater.rs`) vía `tauri-plugin-updater`, no en el
WebView. Su endpoint lo gobierna `plugins.updater.endpoints`, no la CSP, y
meterlo en `connect-src` le daría al WebView una capacidad que no necesita.

## 2. Auditoría de dependencias

`pnpm audit:deps` ([`scripts/audit-deps.mjs`](../../scripts/audit-deps.mjs))
corre dos auditorías y emite un único reporte markdown:

- `pnpm audit` sobre `pnpm-lock.yaml`.
- `cargo deny check advisories` sobre `Cargo.lock`, configurado por
  [`deny.toml`](../../deny.toml) — sólo advisories, sin política de licencias ni
  de bans.

Corre en CI como el job `dependency-audit` en cada pull request, y otra vez en
`publish-release.yml`, donde su reporte queda incrustado en el
`signing-evidence.md` del release.

**Nunca hace fallar un check, por decisión.** La base de advisories cambia con
independencia de este repositorio, así que un rojo significaría "hoy se publicó
un advisory", no "este pull request rompió algo" — y un check que se pone rojo
por razones que nadie en el PR puede arreglar es un check que la gente aprende a
ignorar. El script siempre sale con 0 y el job de CI además lleva
`continue-on-error: true`. Lo que sí se garantiza es visibilidad: el reporte cae
en el resumen del run y, en releases, en un asset versionado.

Cómo leer los hallazgos: la mayoría de los advisories de JavaScript de este
árbol afectan herramientas de build (el dev server de Vite, esbuild, turbo) que
nunca llegan al binario de escritorio. Un hallazgo importa acá cuando toca una
dependencia de runtime de la app publicada o del parser.

## 3. Firmado de código

**Política: publicar sin certificado de firma de plataforma es legítimo y no
bloquea el release. Publicarlo sin decirlo, no.**

Hay dos firmas distintas en juego, y sólo una es opcional:

| Firma                                                    | ¿Bloquea? | Qué protege                                                                                                                                                                                      |
| -------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Firma del updater de Tauri (`TAURI_SIGNING_PRIVATE_KEY`) | **Sí**    | Cada actualización que la app instala se verifica contra la pubkey de `tauri.conf.json`. Sin ella `latest.json` no valida y el release falla antes de que ninguna plataforma empiece a compilar. |
| Firma de plataforma (Authenticode, Apple Developer ID)   | No        | La confianza del sistema operativo al instalar. Su ausencia degrada la experiencia de instalación; no debilita el canal de actualización.                                                        |

Qué significa una build sin firmar para quien la usa:

- **Windows** — el MSI y el EXE no llevan firma Authenticode. SmartScreen
  muestra una advertencia de **Editor desconocido** y hay que elegir _Más
  información → Ejecutar de todas formas_. Ojo: la reputación de SmartScreen
  también depende de telemetría de base instalada, así que un certificado recién
  emitido igual advierte al principio.
- **macOS** — la app no está firmada ni notarizada. Gatekeeper rechaza el primer
  arranque; hay que permitirla en **Ajustes del Sistema → Privacidad y
  seguridad**, o hacer clic derecho sobre la app y elegir _Abrir_.
- **Linux** — AppImage, DEB y RPM no tienen una firma de editor equivalente, así
  que no falta nada.

Dónde vive la evidencia: cada release lleva un asset **`signing-evidence.md`**,
generado en `publish-release.yml` a partir de los mismos outputs del preflight
que deciden el texto de las notas — no pueden contradecirse, porque ninguno de
los dos se escribe a mano. Registra, por plataforma, si el instalador está
firmado, si los artefactos del updater lo están, y el resumen de la auditoría de
dependencias de ese commit. Las notas del release llevan una advertencia de alta
visibilidad por cada plataforma sin firmar.

### El caveat de macOS

`tauri.conf.json` no declara `signingIdentity` ni `hardenedRuntime`, y el
pipeline remonta y reempaqueta el DMG después del build para agregarle el readme
de instalación — lo que invalidaría una firma aplicada por `tauri build`. Firmar
macOS no es entonces cuestión de agregar un secreto: primero hay que rehacer ese
paso de reempaquetado, o aplicar la firma después de él. Esto se documenta en
vez de arreglarse, y la matriz de verificación de release lo dice.

## 4. Superficie de red

Vellum es una aplicación local. Abre exactamente una conexión, y sólo si se lo
piden:

- **El chequeo de actualizaciones** — `tauri-plugin-updater` contactando
  `https://github.com/sebas-tcotd/vellum/releases/latest/download/latest.json`
  al arrancar. Es **opt-out**: el shell de Rust lee `autoUpdateEnabled` de
  `preferences.json` antes de lanzar el chequeo
  (`apps/desktop/src-tauri/src/lib.rs`), así que apagar la preferencia significa
  que no se abre ningún socket — no un chequeo silencioso cuyo resultado se
  esconde. Si la clave o el archivo faltan, cuenta como habilitado, de modo que
  una instalación nueva se comporta como antes. Nada se instala jamás sin un
  clic explícito en el toast de actualización.

Esa es toda la lista. No hay telemetría, ni crash reporting, ni analytics en la
app de escritorio — ni siquiera opt-in. Nada sobre las ciudades, el uso o la
máquina de quien la usa sale de ahí.

### El guardrail

`pnpm check:network`
([`scripts/verify-network-surface.mjs`](../../scripts/verify-network-surface.mjs))
corre en el job `lint-and-test` de CI y **sí** bloquea. Tres pasadas:

1. **Fuentes de producción del frontend** (`apps/desktop/src`,
   `packages/*/src`) no pueden usar `fetch(`, `XMLHttpRequest`, `WebSocket`,
   `EventSource`, `sendBeacon`, `axios`, ni nombrar un SDK de analytics o de
   crash reporting. Los tests quedan fuera, y `apps/landing/**` queda fuera por
   completo: la landing sí corre Google Analytics, y no aporta nada al binario.
2. **Los manifiestos de Rust** no pueden tomar dependencia directa de
   `tauri-plugin-http`, `tauri-plugin-shell`, `tauri-plugin-websocket`,
   `reqwest`, `ureq` ni `hyper`.
3. **La superficie declarada** tiene que seguir diciendo lo que dice hoy: CSP no
   nula, sin `'unsafe-eval'` y con `connect-src` local; ningún permiso
   `fs:`/`http:`/`shell:` en
   [`capabilities/default.json`](../../apps/desktop/src-tauri/capabilities/default.json);
   y exactamente el endpoint de updater de arriba.

La única excepción anotada es el `fetch` sobre `data:` de `dem-protocol.ts`,
marcado con un comentario `vellum-allow-network:` que dice por qué. La suite del
propio script (`scripts/verify-network-surface.test.mjs`) pinea cada regla
contra un repositorio sintético, porque un guardrail que nadie vio fallar es
indistinguible de uno que no detecta nada.

Vive en un script de node y no en ESLint a propósito: `no-restricted-imports` no
ve `fetch(` ni `new WebSocket(`, y `eslint.config.mjs` ignora
`**/src-tauri/**`, así que ESLint nunca miraría el lado Rust ni el JSON de
capabilities.

### Capacidades del WebView

`capabilities/default.json` no le da al WebView ningún permiso de sistema de
archivos ni de HTTP: toda operación de archivos pasa por un comando de Rust
explícito con su propia validación. El permiso del opener está acotado a
`https://github.com/sebas-tcotd/vellum` y sus subrutas — las únicas dos URLs
externas que la app abre son el enlace al repositorio del diálogo Acerca de y
las notas de una actualización pendiente. El `opener:default` sin scope le
habría permitido al WebView abrir cualquier URL, que es la forma que toma un bug
de exfiltración en una app sin ninguna otra superficie de red.
