# ADR-0003 — Bootstrap `wry` sobre el NSIS existente para la UI del instalador Windows

- **Estado:** Aceptada para la vía standalone — **dormida**, no en uso hasta que esa vía se
  retome. El único bloqueo real es la firma de código.
- **Fecha:** 2026-09-09
- **Supersede:** nada. Complementa [0002](0002-nsis-public-windows-installer.md): el motor de
  instalación (NSIS, `currentUser`, migración de MSI previo, WebView2, uninstaller) no cambia.
  Esta ADR sólo reemplaza la capa visual que 0002 ya reconocía como limitada.

## Alcance: esto es para la descarga standalone, no para la Microsoft Store

Vellum no tiene presupuesto para un certificado de firma de código, y SignPath no lo otorgó en
su momento — la misma situación que la app en sí ya enfrenta. La vía más rápida a un instalador
sin fricción de SmartScreen es publicar en la Microsoft Store, que firma el paquete MSIX ella
misma; ese camino no necesita nada de lo que describe esta ADR. **Este bootstrap es
específicamente para cuando exista una vía standalone de descarga y uso** (fuera de la Store),
donde sí hace falta convencer a Windows de que un `.exe` nuevo es confiable, y donde este spike
ya resuelve el problema de branding que 0002 dejó abierto. Hasta entonces queda completo pero sin
usar — deliberadamente fuera del workspace raíz y de CI (ver Consecuencias).

## Contexto

0002 aceptó NSIS como instalador público recomendado el mismo día que esta ADR se abre. Al
personalizarlo al máximo (ver [vellum-installer.nsi](../../apps/desktop/src-tauri/installer/vellum-installer.nsi)),
el techo visual de los controles Win32 nativos quedó expuesto: una barra de progreso
(`PROGRESS_CLASS`) no puede tener esquinas redondeadas, gradiente ni transición suave sin
dibujo manual (GDI+ owner-draw o un plugin de terceros). El objetivo de branding — una barra
como la de apps como Discord o Notion — no es alcanzable con controles Win32 estándar.

## Opciones consideradas

**A. Reescribir el instalador como app Tauri completa.** Descartada en la sala sin construir
nada: implicaría reimplementar desde cero la elevación, el registro en Add/Remove Programs, el
uninstaller, la migración del MSI legacy (0002) y los flags `/S`/`/UPDATE` que
`tauri-plugin-updater` ya espera en `latest.json`. Reescribir meses de trabajo probado para
arreglar un `border-radius` es la definición de sobre-ingeniería.

**B. Plugin NSIS que embebe WebView2 en una página custom** (p. ej. `nsWebView2` y variantes de
comunidad). Cambio mínimo sobre el `.nsi` actual, pero depende de un plugin de terceros de
mantenimiento incierto — riesgo que el instalador público no puede permitirse.

**C. Bootstrapper nativo delgado (`wry` directo, sin el framework Tauri) que invoca el NSIS
existente en modo silencioso** — **elegida**. `wry` es el mismo runtime WebView2/WKWebView
que usa Tauri por debajo, sin el bundler, el IPC ni el sistema de plugins que un instalador no
necesita. El motor de instalación (NSIS) no se toca; sólo se le antepone una ventana propia.

## Evidencia

Código en [apps/desktop/src-tauri/installer-bootstrap/](../../apps/desktop/src-tauri/installer-bootstrap/),
deliberadamente fuera del workspace raíz (`[workspace]` vacío en su propio `Cargo.toml`).

- **Compila y corre limpio en macOS** (fallback simulado, sin invocar NSIS real) y **en Windows
  real**, confirmado por captura de pantalla en varias corridas: ventana "Vellum Setup"
  renderizada por WebView2, logo circular, tipografía Georgia, barra con `border-radius: 999px`
  y `linear-gradient` exactamente como el objetivo de branding.
- **Bug real encontrado y corregido en el `.nsi` existente, no en el spike:**
  `!insertmacro MUI_LANGDLL_DISPLAY` en `.onInit` no comprobaba `${Silent}`. Un `/S` real —de
  este bootstrap o de cualquier despliegue automatizado futuro— quedaba bloqueado
  indefinidamente esperando que alguien responda un diálogo nativo de selección de idioma que
  nadie ve. Corregido envolviéndolo en `${IfNot} ${Silent}`, siguiendo el mismo patrón que el
  archivo ya usa en `Section Install` y `.onInstSuccess`.
- **Corrida de punta a punta exitosa en Windows real**: el bootstrap invocó
  `vellum-installer.exe /S /R` en segundo plano (`CREATE_NO_WINDOW`), y al terminar la
  instalación silenciosa Vellum se abrió solo, sin ningún diálogo nativo interpuesto. Reutiliza
  el flag `/R` que `.onInstSuccess` ya implementaba en vez de que el bootstrap reimplemente la
  lógica de lanzamiento post-instalación.
- **Consola negra corregida:** un binario Rust plano usa el subsistema de consola por defecto.
  `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]` la suprime en release y
  la conserva en debug, que es donde se leen los `eprintln!` de diagnóstico.
- **Carpeta `.WebView2` corregida:** por defecto WebView2 escribe su perfil de usuario junto al
  `.exe`. Redirigida a `%TEMP%` vía `WebContext::new(Some(path))` +
  `WebViewBuilder::with_web_context`, para no ensuciar la carpeta que un usuario se descarga.
  Confirmado en Windows real: `dist/` queda con exactamente los dos `.exe` esperados.
- **Fallback si WebView2 no está disponible:** la creación de la ventana o del webview ya no
  hace `panic!`. Si falla, el bootstrap corre `vellum-installer.exe` directamente, sin `/S` —
  entra a la UI interactiva de NSIS (que no depende de WebView2; usa `nsDialogs` nativo) y su
  propia `Section WebView2` tiene ocasión de instalar el runtime que al bootstrap le faltó. Sin
  este fallback, una máquina sin WebView2 no instalaba nada; con él, el peor caso es perder el
  branding, no la instalación. No probado en una máquina realmente sin WebView2 —ninguna de las
  disponibles para el spike carecía de él—, pero la ruta de código es la misma que ya funciona en
  modo interactivo hoy.
- **Empaquetado resuelto:** [package-windows-bootstrap.mjs](../../scripts/package-windows-bootstrap.mjs)
  (`pnpm package:windows-bootstrap`) construye el bootstrap en release, localiza el `.exe` de
  NSIS en `target/release/bundle/nsis/` (raíz del repo — el workspace de Cargo comparte un solo
  `target/`, no `apps/desktop/src-tauri/target/`) y copia ambos a `installer-bootstrap/dist/`
  como `Vellum-Setup.exe` y `vellum-installer.exe`. Confirmado en Windows real: el bootstrap
  encuentra el instalador sin que nadie pase una ruta a mano.

## Decisión

Se adopta la opción C. El trabajo de esta ADR queda **completo para la vía standalone**, con una
sola excepción deliberada:

- **Firma de código: fuera de alcance de esta ADR.** No hay presupuesto ni firma de SignPath
  disponible. `installer-bootstrap.exe` seguirá sin firmar hasta que eso cambie o hasta que se
  decida absorber el costo de SmartScreen sin firma (igual que la app ya lo hace hoy).
- **`latest.json` y el reemplazo del NSIS puro (punto pendiente de la versión anterior de esta
  ADR): pospuesto, no descartado.** No aplica mientras la vía pública siga siendo la Store; se
  decide cuando la vía standalone se retome, no antes.

## Consecuencias

**Positivas**

- El techo visual de 0002 queda resuelto sin reescribir ni arriesgar el motor de instalación ya
  validado: NSIS sigue siendo quien instala, desinstala, migra el MSI legacy y gestiona
  WebView2.
- El bug del diálogo de idioma bajo `/S` se corrigió para **cualquier** invocación silenciosa
  futura del instalador, no sólo para este spike.
- Nada de esto compite con la Microsoft Store ni le agrega trabajo: son dos vías de distribución
  independientes, y esta queda lista para cuando la standalone se active.

**Negativas y costes aceptados**

- Dos binarios en vez de uno cuando esta vía se active: el pipeline de release ganará el paso de
  empaquetado (ya escrito) y, eventualmente, de firma (no escrito, no presupuestado).
- La barra de progreso es animación simulada, no progreso real — un `/S` no expone un canal de
  progreso genuino sin una IPC adicional del lado NSIS, que queda fuera de alcance.
- Superficie nueva que mantener cuando se reactive: un crate Rust más. Deliberadamente fuera del
  workspace raíz y de `rust:fmt`/`rust:lint`/`rust:test` mientras esté dormido — se verificó a
  mano (`cargo fmt`, `cargo clippy -- -D warnings`) antes de dejarlo, pero nadie lo revisa en CI
  hasta que se reincorpore.

## Referencias

- [0002-nsis-public-windows-installer.md](0002-nsis-public-windows-installer.md)
- [apps/desktop/src-tauri/installer-bootstrap/src/main.rs](../../apps/desktop/src-tauri/installer-bootstrap/src/main.rs)
- [apps/desktop/src-tauri/installer/vellum-installer.nsi](../../apps/desktop/src-tauri/installer/vellum-installer.nsi) — fix de `MUI_LANGDLL_DISPLAY` bajo `${Silent}`
- [scripts/package-windows-bootstrap.mjs](../../scripts/package-windows-bootstrap.mjs)
