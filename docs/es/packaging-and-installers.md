# Empaquetado e instaladores

- [English](../en/packaging-and-installers.md)
- [Volver al índice en español](index.md)

Vellum publica descargas independientes y genera un paquete MSIX aparte para
enviarlo a Microsoft Store. Publicar el MSIX en GitHub no lo certifica ni lo
hace instalable directamente; la distribución por Store requiere la
certificación y firma de Microsoft. Consulta [Empaquetado MSIX](msix.md) para
los pasos de envío y validación. Esta página describe los artefactos, su
identidad y lo que CI verifica frente a lo que alguien debe comprobar a mano.

## Qué produce un release

| Plataforma | Artefacto                       | Dónde se ve la identidad                                                                  | Firma hoy                                                                |
| ---------- | ------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Windows    | `.exe` (NSIS) — **recomendado** | Instalación one-click por usuario, progreso y apertura final de Vellum.                   | Actualmente sin firma; Authenticode sólo si hay certificado configurado. |
| Windows    | `.msi` (WiX) — alternativa      | Editor en Programas y características, banner y diálogo opt-in `.cslmap`.                 | La misma condición.                                                      |
| Windows    | `.msix` — envío a Store         | Identidad del paquete, logos y asociaciones `.cslmap` / `.vellummap`.                     | Envío sin firma; Microsoft firma el paquete Store certificado.           |
| macOS      | `.dmg`                          | La ventana del volumen: fondo, tamaño y posiciones de la app y del alias de Aplicaciones. | **Nunca firmado ni notarizado.** El gate sigue en `false`.               |
| Linux      | `.deb`, `.rpm`                  | El `.desktop`: nombre, comentario, icono, categoría.                                      | No existe firma de editor equivalente para estos formatos.               |
| Linux      | `.AppImage`                     | Nada más allá del icono embebido y el nombre del binario.                                 | Igual.                                                                   |

`finalize-release` exige el `.exe` NSIS, el `.msi`, el `.msix`, el `.dmg`, el `.AppImage` y
`latest.json`. El MSIX queda fuera del actualizador Tauri; Store gestiona las
actualizaciones de esa edición. Las firmas del updater no implican firma
Authenticode del instalador independiente. El updater genérico de Windows (`windows-x86_64`) apunta al EXE;
las claves explícitas de MSI y NSIS permanecen para instalaciones existentes.
Las builds sin firma conservan la advertencia que la Story 1.8 puso
en las notas y en `signing-evidence.md` — el artwork no la atenúa, y un
instalador más bonito no es evidencia de procedencia.

**Dos MSI, uno por idioma.** `bundle.windows.wix.language` declara `en-US` y
`es-ES`, y WiX compila un MSI por locale. Se publican los dos; el cuerpo del
release enlaza el primero que encuentra. Es el precio de que el diálogo de
`.cslmap`, cuyos textos están en español, deje de vivir sobre una UI base sólo
en inglés.

## De dónde sale la identidad

Cada cadena visible y cada píxel se derivan de una sola fuente versionada:

```
brand/installer-copy.json ── pnpm brand:build ──→ apps/desktop/src-tauri/installer/*.bmp, *.png
brand/vellum-mark.svg    ──┘        └─ a mano ──→ tauri.conf.json, linux/vellum.desktop
```

Nada de `apps/desktop/src-tauri/installer/` se edita en su destino, y ningún
texto de instalador se escribe fuera de `brand/installer-copy.json`. El flujo
está en [`brand/README.md`](../../brand/README.md). `pnpm check:installer` falla
si un derivado falta, mide otra cosa, fue retocado a mano, o se generó desde un
`brand/` distinto del commiteado. La comparación es por hash de contenido, no
por fecha: tocar un archivo no cambia nada, y editar un byte de cualquiera de
los dos lados se detecta.

## Qué se puede personalizar de verdad

Menos de lo que sugieren las capturas de las herramientas de empaquetado.

**Windows / WiX (MSI).** Dos bitmaps, ambos de tamaño obligatorio: el banner de
493×58 (se dibuja en todas las páginas menos la primera, con el título de la
página a su izquierda) y la imagen de diálogo de 493×312 (páginas de bienvenida
y final, donde sólo los 164px de la izquierda quedan sin texto encima). Los dos
tienen que ser BMP de 24 bits; un bitmap con canal alfa se renderiza como un
rectángulo negro. La _secuencia_ de diálogos sólo es extensible mediante
fragmentos WiX — que es justamente como existe el checkbox opt-in de `.cslmap`.

**Windows / NSIS (EXE).** Es el instalador público. Su template versionado se
basa en Tauri 2.10.3 y reduce el flujo a identidad Vellum, **Install Vellum**,
progreso y **Open Vellum**. Conserva `/S`, actualización y desinstalación de
Tauri, y se instala por usuario (`installMode: "currentUser"`) sin UAC. El MSI
se mantiene como alternativa para despliegues gestionados; su opt-in de
`.cslmap` no se replica automáticamente en NSIS.

**macOS / DMG.** Una imagen de fondo, el tamaño de la ventana y la posición de
la app y del alias de Aplicaciones. Esa es toda la superficie — no hay flujo de
instalación, sólo una ventana con dos iconos y una flecha entre ellos.

**Linux.** No existe UI de instalación. `dpkg -i` y `dnf install` no muestran
nada. El `.desktop` compartido por el `.deb` y el `.rpm` **es** la identidad:
nombre, comentario localizado, icono, categorías `Graphics;Education;` y el
tipo MIME de `.cslmap`.

## Por qué ningún instalador pide aceptar una licencia

`bundle.license` es `"MIT"` —llena los campos de metadatos del MSI, del `.deb`
y del `.rpm`—, pero `bundle.licenseFile` está ausente a propósito, y
`check:installer` falla si vuelve. Declararlo haría que `hdiutil` embebiera el
LICENSE como software licence agreement: habría que aceptar el texto MIT antes
incluso de que monte el volumen del DMG, y lo primero que debe encontrarse el
usuario es la ventana que explica arrastrar Vellum a Aplicaciones. La misma
clave le da al MSI una página de licencia que nadie lee. MIT es permisiva: usar
Vellum no requiere ninguna aceptación, así que ningún instalador la pide.

## Límites conocidos

- **Las posiciones de los iconos del DMG no son fiables en CI.** El bundler de
  DMG de Tauri conduce Finder por AppleScript para colocar los iconos y poner
  el fondo. En un runner headless de GitHub, sin window server con sesión
  iniciada, ese paso es inestable y puede saltarse en silencio: queda un DMG
  cuya ventana cae al default de Finder mientras el build reporta éxito. Por eso
  el layout configurado se verifica abriendo el DMG en un Mac real, y su fila
  vive en la [matriz de verificación de release](release-verification-matrix.md).
- **El DMG ya no se reabre después del build.** Antes un paso lo convertía a
  lectura/escritura, copiaba dentro un readme y lo reempaquetaba. Un archivo
  añadido después de que el bundler colocara los iconos no tiene posición
  propia, así que aterrizaba encima del layout — y reempaquetar habría
  invalidado la firma si hubiera habido alguna. La guía de instalación vive en el
  cuerpo del release —arrastrar a Aplicaciones, más la nota de Gatekeeper— y la
  salida de emergencia `xattr -cr`, en el [README](../../README.md); las dos se
  leen antes de descargar en vez de después de montar.
- **CI nunca ejecuta el rasterizador.** `pnpm brand:build` se corre a mano y su
  salida se commitea, así que ningún runner rasteriza nada en la ruta del
  release. `@resvg/resvg-js` **sí** se instala en todos los runners —es
  devDependency de la raíz, así que `pnpm install` lo baja—, pero nada en CI lo
  invoca. Está pineado a versión exacta y no a rango con caret, porque el
  guardrail compara hashes de salida y un bump menor se leería como artwork
  retocado a mano.

- **La asociación `.cslmap` del MSI independiente es exclusiva de Windows y opt-in.**
  El MSIX declara asociaciones `.cslmap` y `.vellummap` en su manifiesto de
  paquete; no son la casilla del MSI.
  El `.desktop` no declara `MimeType`: nada en el `.deb` ni en el
  `.rpm` instala una definición shared-mime-info para `*.cslmap`, y hacerlo
  exigiría un script de mantenedor que esta story descarta — así que la línea no
  emparejaría con nada mientras aparenta estar verificada.
- **Los iconos de la app de macOS y Linux no se regeneran con nada de esto.**
  `src-tauri/icons/` —el `.icns`, el set de PNG y el `Assets.car` de Icon
  Composer— se commitearon sin fuente reproducible, y
  `icons/iconcomposer/README.md` documenta un proceso manual con Xcode. El de
  **Windows** sí: `pnpm icons:windows` deriva `icons/windows/` (el `.ico` y los
  logos del MSIX) de `brand/windows-app-icon.svg`, y `check:installer` lo
  verifica. Ver [`brand/README.md`](../../brand/README.md).

## Por qué no hay scripts de instalación

Ningún `preInstallScript`, `postInstallScript`, `preRemoveScript`,
`postRemoveScript` ni `installerHooks` de NSIS, y `check:installer` falla si
aparece uno. Un instalador que ejecuta código lo ejecuta con los privilegios que
tuviera la instalación, y es la parte del paquete que nadie lee. Vellum no
necesita nada de eso: los instaladores independientes copian archivos a su
prefijo de instalación. La asociación opt-in de `.cslmap` del MSI usa entradas
de registro declarativas de WiX que el MSI elimina al desinstalar. Las
asociaciones MSIX se declaran en el manifiesto del paquete y las gestiona Windows.

No se declara ninguna dependencia que instale software de terceros. Desinstalar
la edición independiente quita la aplicación y su asociación registrada; los
mapas, los temas de terceros y las preferencias permanecen en los directorios
de datos del usuario. La edición Store usa almacenamiento separado por paquete,
que puede eliminarse al desinstalar: guarda copias de temas personalizados
primero (ver [Empaquetado MSIX](msix.md)). Los mapas exportados fuera del paquete
siguen siendo archivos normales.

El template NSIS de Vellum no es un hook: es código de empaquetado revisado. El
guardrail verifica que conserve instalación por usuario, `/S`, actualización,
uninstaller y apertura final. La decisión y su coste de mantenimiento están en
el [ADR 0002](../adr/0002-nsis-public-windows-installer.md).
