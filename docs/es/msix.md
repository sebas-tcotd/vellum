# MSIX de Microsoft Store

El release Windows empaqueta el ejecutable x64 independiente existente, con el
mismo commit y versión Tauri; no recompila por canal. La identidad es
`SebastianVargasPizango.VellumCityMaps`, Publisher
`CN=F93C1C62-364D-4C65-83BA-6DDD8A04B97F`, nombre **Vellum City Maps** y nombre del
publicador **Sebastian Vargas Pizango**. El publisher de Tauri independiente no
cambia. La versión mínima de Windows es `10.0.17763.0`.

Tras compilar el ejecutable release, desde la raíz del repositorio:

```powershell
./scripts/package-msix.ps1 -Executable target/x86_64-pc-windows-msvc/release/vellum.exe
```

El script descubre `makepri` y `makeappx` x64 del SDK Windows instalado. `-SdkBin`
permite seleccionar su directorio. `-Version X.Y.Z` debe coincidir con la versión
estable Tauri y cada componente debe estar entre 0 y 65535. El ejecutable debe
declarar el producto `Vellum` y esa misma versión en sus metadatos. La versión MSIX será
`X.Y.Z.0`. `-OutputDirectory` debe estar dentro de `target` de este repositorio,
sin contener el ejecutable de entrada ni atravesar junctions. No borra inputs.
Cada ejecución conserva un directorio de preparación nuevo para inspección.
La salida predeterminada es `target/msix/VellumCityMaps_X.Y.Z.0_x64.msix`.

Incluye el mismo ejecutable, todos los recursos declarados por Tauri, temas
integrados, logos existentes, manifiesto y PRI generado. Las asociaciones
`.cslmap` y `.vellummap` pasan la ruta como `"%1"`. No incluye installer-bootstrap.
Desempaqueta y comprueba el SHA256 del ejecutable y la ausencia de firma del
paquete antes de anunciar éxito.

El MSIX subido queda sin firma para certificación y firma Microsoft. No es una
descarga pública instalable directamente ni forma parte del actualizador Tauri.
No crea, confía ni usa certificados locales. CI exige el asset MSIX antes de
finalizar el release de GitHub; no envía nada a Partner Center. Para el primer
envío a Store, el workflow deja el release `v1.0.0` como borrador después de
pasar todos los gates. Descarga su MSIX desde la página de borradores de GitHub
Releases y registra el SHA-256 con `Get-FileHash -Algorithm SHA256` antes de
enviar ese archivo a Partner Center. Cuando Microsoft apruebe el envío, descarga
otra vez el asset del borrador y compara su hash con el valor registrado. Luego
abre el mismo borrador en GitHub Releases y usa **Edit release** → **Publish
release**. El paquete que distribuye Store lleva firma Microsoft, así que sus
bytes difieren; comparten el build de la app revisado y el tag. El workflow
sigue publicando automáticamente los tags
posteriores. El tag, el commit y el archivo del código fuente son públicos
aunque los assets del release estén en borrador; un tag posterior puede pasar a
ser `releases/latest` para el updater antes de que termine la certificación. Si
el workflow se vuelve a ejecutar tras la publicación manual, conserva el estado
público y valida el manifiesto público del updater.

La aplicación empaquetada desactiva su actualizador; Store gestiona actualizaciones.
Preferencias, perfil WebView2 y temas personalizados usan almacenamiento Windows
por paquete, separado de la instalación independiente. No se promete migración
automática. Guarda copias de temas antes de desinstalar: los datos del paquete
pueden eliminarse. Las exportaciones guardadas fuera del paquete son archivos
normales. Los temas integrados permanecen en el paquete de solo lectura.

## Validación pendiente antes del envío

Estas pruebas están pendientes para el paquete final y la muestra definitiva v1.0.
El spike anterior no demuestra que este paquete las haya pasado. Registrar hash
del paquete, commit, versión Windows, muestra y resultados de cada prueba:

- [x] Inspeccionar con SDK unpack (ver el registro de abajo): identidad Store, `X.Y.Z.0`, x64, Windows mínimo,
      asociaciones entre comillas, logos, recursos runtime, mismo hash de exe y
      ausencia de `AppxSignature.p7x` en el envío unsigned.
- [ ] Obtener certificación/firma Microsoft; no tratar la subida GitHub como
      certificación ni afirmar instalación Store antes de realizarla.
- [ ] Instalar desde Store en Windows 10 y Windows 11 limpios; verificar el aviso
      de falta de WebView2 cuando corresponda y abrir sin conexión.
- [ ] Doble clic en `.cslmap` y `.vellummap`, con espacios y caracteres no ASCII
      en las rutas, usando la muestra definitiva; comprobar mapa correcto.
- [ ] Verificar ausencia de solicitudes de red de la aplicación y del updater.
- [ ] Exportar PNG y SVG; revisar archivos y carpetas de destino.
- [ ] Probar todos los temas integrados y guardar/cargar un tema personalizado;
      verificar separación de preferencias y temas de la edición independiente.
- [ ] Desinstalar; comprobar eliminación de datos y asociaciones del paquete,
      conservación de exportaciones externas y de la instalación independiente.

## Registro de validación

### 2026-10-06 — inspección del paquete y prueba de humo local

Commit `09ea4c0`, versión 0.14.0, Windows 11 (10.0.26200), SDK 10.0.26100.0,
paquete `VellumCityMaps_0.14.0.0_x64.msix`, muestra Costa Tijuca. Es una
inspección del paquete sin instalar y una prueba con el ejecutable suelto; no
sustituye la validación en Windows limpio ni la certificación Store.

| Prueba                                       | Resultado                                                                                                                                                                         |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SDK unpack: manifiesto                       | Correcto: identidad Store, `0.14.0.0`, x64, mínimo `10.0.17763.0`, asociaciones con `"%1"`, logos y `resources.pri`.                                                              |
| Hash del exe empaquetado                     | `BA532CF931B0DD1DFC8A4B9A6D700FD763FC9C21DBB64970405C32C1F9A7EE01`, igual al exe de entrada.                                                                                      |
| `AppxSignature.p7x`                          | Ausente, como corresponde al envío sin firma.                                                                                                                                     |
| Muestra incluida                             | SHA-256 `8B1AC9D4…FBEB3` dentro del paquete; `cargo test --package vellum --test sample_city` pasa.                                                                               |
| `pnpm check:network`, `pnpm check:installer` | Pasan.                                                                                                                                                                            |
| Abrir `.vellummap` por argv                  | El mapa carga y se dibuja con una ruta con espacios y caracteres no ASCII. Se ejecutó el exe suelto, no el paquete instalado.                                                     |
| Red del exe suelto, 12 s tras abrir          | Dos conexiones HTTPS a `52.97.x.x:443`, ambas de `msedgewebview2.exe` (runtime de WebView2), ninguna de `vellum.exe`. No concluyente: repetir con el MSIX instalado.              |
| `scripts/package-msix.test.mjs`              | Con PowerShell 7, 15 de 16 pasan. Falla «rejects absent and non-PE input» porque compara el mensaje en inglés («does not exist») y este Windows está en español; en CI no ocurre. |

Sigue pendiente todo lo demás de la lista: instalación Store en Windows 10 y 11
limpios, doble clic desde el Explorador con el paquete instalado, red del paquete
sin conexión y con el updater desactivado, PNG/SVG, temas, desinstalación y
certificación Microsoft.
