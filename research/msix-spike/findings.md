# Hallazgos del spike 6.2: prototipo descartable de MSIX

Pregunta: ¿el `vellum.exe` de release funciona empaquetado como MSIX? Es decir, ¿instala, abre `.cslmap` desde el Explorador y pasa el WACK? [ADR-0003](../../docs/adr/0003-bootstrap-wry-instalador-windows.md) da por hecho que la Microsoft Store (MSIX) es la vía sin SmartScreen; este spike lo comprueba en una máquina real.

El prototipo es descartable: `AppxManifest.xml` y `build.ps1` viven aquí, fuera del workspace y de CI, como `installer-bootstrap/`. La salida se genera en `target/msix-spike/`, que Git ignora. No se tocó código de la app, `tauri.conf.json`, el pipeline de release, WiX, NSIS ni `verify-installer-identity.mjs`.

## Veredicto por criterio

| Criterio                | Veredicto                        | Evidencia                                                                                                                                                                                                                                                       |
| ----------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build y firma           | **pasa**                         | `build.ps1` genera `target/msix-spike/Vellum_0.11.1.0_x64.msix` (6,1 MB, 11 archivos). `makeappx pack` valida el manifiesto contra el esquema del SDK 10.0.26100 sin errores. `signtool sign` firma; `signtool verify /pa` falla solo por la raíz no confiable. |
| Instala                 | **pasa**                         | Tras confiar el `.cer` en `LocalMachine\TrustedPeople`, `Add-AppxPackage` instala. `Get-AppxPackage VellumSpike.Vellum` devuelve la versión `0.11.1.0` en `C:\Program Files\WindowsApps\VellumSpike.Vellum_0.11.1.0_x64__nvhxg3dwx54f0`.                        |
| Abre archivos `.cslmap` | **pasa**                         | Doble clic en `altavento.cslmap` y en `fährimperium.cslmap` (path no ASCII): Vellum arranca y carga los dos mapas. El humano no observó ningún comportamiento inesperado (2026-09-30).                                                                          |
| WACK                    | **pasa** (con un aviso opcional) | `appcert.exe` 10.0.26100.8249 en Windows 11 Pro 26200: `OVERALL_RESULT=PASS`, 23 de 24 tests en PASS. El único FAIL es opcional; detalle en [Resultado del WACK](#resultado-del-wack).                                                                          |

**Tiempo empleado:** unos 30 minutos de agente (manifiesto, script, build, informe) más los pasos manuales del humano, dentro de las 4 horas del límite. El spike terminó dentro de ese límite y ningún criterio quedó «bloqueado». La compilación de release tardó 51 s (incremental) y el script completo, 1 min 12 s.

## Qué se construyó

**`AppxManifest.xml`.** El mínimo de desktop bridge:

- `EntryPoint="Windows.FullTrustApplication"` + `rescap:runFullTrust`.
- Logos existentes de `apps/desktop/src-tauri/icons/` (`Square44x44Logo.png`, `Square150x150Logo.png`, `StoreLogo.png`). No se generó ninguno.
- Identidad: `Properties/DisplayName` es el `productName` de `tauri.conf.json`, y `build.ps1` lo comprueba. `Description` y los valores de `uap:VisualElements` (`DisplayName`, `Description`) se copiaron a mano de `productName` y `bundle.shortDescription`; el script no los comprueba. `Publisher` es `CN=Sebastian Enrique Vargas Pizango` (el `bundle.publisher`). `Version` es `0.11.1.0`, porque MSIX exige cuatro partes. `Identity Name="VellumSpike.Vellum"` es de prueba.
- `TargetDeviceFamily Windows.Desktop`, con `MinVersion 10.0.17763.0` (1809) y `MaxVersionTested 10.0.26100.0`.

La asociación usa `uap3:FileTypeAssociation` y no `uap:FileTypeAssociation`. `uap3` es la extensión del mismo elemento que añade el atributo `Parameters` (lo confirma `UapManifestSchema_v3.xsd` del SDK); sin ella no hay forma de declarar `"%1"` explícitamente. El path sigue llegando por argv a `capture_startup_file_path()` (`startup.rs`), igual que con el fragmento WiX.

**`build.ps1`.** Solo usa el SDK 10.0.26100 y PowerShell:

1. Comprueba que `Version`, `Publisher` y `DisplayName` del manifiesto coinciden con `tauri.conf.json`; si no, aborta.
2. Ejecuta `pnpm tauri build --no-bundle` en `apps/desktop`. Con `-SkipBuild` reutiliza `target/release/vellum.exe`.
3. Monta el layout: `vellum.exe`, `themes/*.vellumstyle` y `Assets/`. Los temas van en `resource_dir/themes`, la primera ruta que prueba `resolve_builtin_themes_dir`.
4. Ejecuta `makepri createconfig` y `makepri new`, y después `makeappx pack`.
5. Crea (o reutiliza) un certificado autofirmado en `Cert:\CurrentUser\My`, con Subject igual al `Publisher` y EKU de firma de código. Lo exporta a `target/msix-spike/VellumSpike.cer` y firma con `signtool sign /fd SHA256`.
6. Ejecuta `signtool verify /pa`, que falla como se espera: `A certificate chain processed, but terminated in a root certificate which is not trusted`.

Certificado de esta corrida: huella `E4FDAA2B3E6766E4C7B00B65A4DF2F64A2861F0E`, válido 3 meses. El script lo reutiliza en corridas siguientes mientras siga vigente.

Efecto secundario: la compilación de release reescribe `Cargo.lock` (paquete `vellum` 0.10.0 → 0.11.1), porque el bump de release-please no actualizó el lockfile. Se revirtió con `git checkout -- Cargo.lock` y queda anotado como hallazgo fuera del spike.

## Resultado del WACK

Informe: `target/msix-spike/wack-report.xml` (fuera de Git; generado el 2026-09-30 a las 00:05). `APP_TYPE=Centennial`, `OVERALL_RESULT=PASS`.

El único test en FAIL es **«Ejecutables bloqueados»**, marcado `OPTIONAL="TRUE"`, así que no hace fallar el resultado global. Detecta en `vellum.exe` referencias a `kernel32!CreateProcessW`, `shell32!ShellExecuteW` y `ShellExecuteExW`, y las cadenas `cmd`, `cmd.exe`, `\cmd.exe`, `basH` y `CDb`. Causa probable (**hipótesis sin comprobar**: no se inspeccionó el binario ni se buscó en el código):

- `std::process::Command` de Rust importa `CreateProcessW` y lleva la cadena `cmd.exe` para ejecutar scripts `.bat`/`.cmd`.
- `commands.rs` lanza `explorer` para mostrar la carpeta de exportación, y `tauri-plugin-opener` usa `ShellExecuteW`.
- `basH` y `CDb` son falsos positivos: bytes del binario que coinciden por casualidad con nombres de ejecutables.

Tampoco se comprobó que ninguna ruta de código lance `cmd.exe`, ni que la certificación de la Store trate este aviso como no bloqueante para una app full trust: las dos cosas son hipótesis. Si la certificación lo señala, hay que investigarlo entonces.

Lo confirmado: pasaron todos los demás tests, entre ellos los obligatorios «Manifiesto de aplicación», «Paquetes de recursos», «Personalización de marca», «Firma de código privado», «Capacidades de uso especial» y «DPIAwarenessValidation», y los opcionales «Recursos de aplicación», «Verbos de asociación de archivos» y «Archivos apropiados para la plataforma». Esta ejecución del WACK no incluye un test de analizador binario (`/DYNAMICBASE`, `/NXCOMPAT`), así que no hay evidencia sobre esos flags.

## Pasos manuales

El humano ejecutó estos pasos el 2026-09-30; los resultados están en la tabla de veredictos. No informó de forma explícita la comprobación de los 5 temas (paso 3) ni el listado de `LocalCache` (paso 5), solo que no observó ningún comportamiento inesperado. Por eso el riesgo «Escrituras de archivos» sigue sin verificar.

Todos los paths son relativos a la raíz del repo. En esta máquina ya hay un Vellum NSIS instalado (`%LOCALAPPDATA%\Vellum`), así que en Inicio aparecerán dos entradas «Vellum». La del MSIX es la que Windows asocia al paquete `VellumSpike.Vellum`. Hoy no existe ninguna asociación `.cslmap` en `HKCR`, así que la del paquete no compite con nada.

**1. Confiar el certificado de prueba (PowerShell elevado):**

```powershell
Import-Certificate -FilePath target\msix-spike\VellumSpike.cer -CertStoreLocation Cert:\LocalMachine\TrustedPeople
& "C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64\signtool.exe" verify /pa target\msix-spike\Vellum_0.11.1.0_x64.msix
```

Resultado esperado: `signtool verify` responde `Successfully verified`.

**2. WACK (PowerShell elevado).** Va antes de instalar a mano, porque WACK instala y desinstala el paquete por su cuenta:

```powershell
$appcert = "C:\Program Files (x86)\Windows Kits\10\App Certification Kit\appcert.exe"
& $appcert reset
& $appcert test -appxpackagepath "$PWD\target\msix-spike\Vellum_0.11.1.0_x64.msix" -reportoutputpath "$PWD\target\msix-spike\wack-report.xml"
Select-Xml -Path target\msix-spike\wack-report.xml -XPath '//REPORT' | ForEach-Object { $_.Node.OVERALL_RESULT }
Select-Xml -Path target\msix-spike\wack-report.xml -XPath '//TEST[RESULT="FAIL"]' | ForEach-Object { $_.Node.NAME }
```

Anotar en este informe el resultado global y cada test que falle, con su causa probable.

**3. Instalar (PowerShell normal, sin elevar):**

```powershell
Add-AppxPackage -Path target\msix-spike\Vellum_0.11.1.0_x64.msix
Get-AppxPackage VellumSpike.Vellum | Select-Object Name, Version, InstallLocation
```

Si falla, el error trae un `ActivityId`. `Get-AppPackageLog -ActivityID <ActivityId>` da el log; se copia aquí junto con el HRESULT.

Después, abrir Vellum desde Inicio y comprobar que el selector de temas muestra los 5 temas integrados. Eso confirma que `resource_dir()` resuelve dentro de `WindowsApps`.

**4. Abrir archivos:**

- Doble clic en `packages/parser-cslmap/fixtures/altavento.cslmap`. Si Windows pregunta con qué abrirlo, elegir el Vellum del paquete.
- Lo mismo con `packages/parser-cslmap/fixtures/fährimperium.cslmap`, cuyo path no es ASCII.
- En los dos casos Vellum debe arrancar y cargar ese mapa. Si arranca vacío, el path llegó mal o no llegó; se anota como hallazgo.

**5. Virtualización de AppData (opcional, informativo):**

```powershell
Get-ChildItem "$env:LOCALAPPDATA\Packages\VellumSpike.Vellum_*\LocalCache" -Recurse -Depth 3 | Select-Object FullName
```

Si Windows redirigió las escrituras, aquí aparecerán `Roaming\com.vellum.desktop\themes` (temas de usuario) y el perfil de WebView2 (`Local\com.vellum.desktop\EBWebView`).

## Limpieza

Estos comandos dejan la máquina sin el paquete ni el certificado de prueba:

```powershell
# PowerShell normal
Get-AppxPackage VellumSpike.Vellum | Remove-AppxPackage
Get-ChildItem Cert:\CurrentUser\My | Where-Object FriendlyName -eq 'Vellum MSIX spike (test only)' | Remove-Item -DeleteKey

# PowerShell elevado
Get-ChildItem Cert:\LocalMachine\TrustedPeople | Where-Object Subject -eq 'CN=Sebastian Enrique Vargas Pizango' | Remove-Item

# Opcional: salida del build
Remove-Item target\msix-spike -Recurse -Force
```

`-DeleteKey` borra también la clave privada. El filtro por Subject cubre cualquier certificado regenerado; la huella de esta corrida (`E4FDAA2B3E6766E4C7B00B65A4DF2F64A2861F0E`) queda solo como referencia, y `build.ps1` imprime la vigente al final («Certificate: ... thumbprint ...»).

Para comprobar la limpieza: `Get-AppxPackage *Vellum*` no devuelve nada, y `Get-ChildItem Cert:\LocalMachine\TrustedPeople, Cert:\CurrentUser\My | Where-Object Subject -eq 'CN=Sebastian Enrique Vargas Pizango'` tampoco.

## Riesgos y hallazgos estáticos

Salen de leer el código contra el modelo de MSIX, salvo el primero, que confirmó el humano. No se corrigió ninguno.

- **`.vellummap` no queda asociado.** El manifiesto del spike solo declara `.cslmap`, como pedía el spec, aunque `capture_startup_file_path()` (`startup.rs`) acepta también `.vellummap`. El humano confirmó el 2026-09-30 que los `.vellummap` siguen sin asociar. Una build de Store debería declarar las dos extensiones, con un segundo `uap:FileType` en la misma asociación o una asociación aparte.

- **El updater es incompatible con MSIX.**
  - `lib.rs` registra `tauri-plugin-updater` y hace un check al arrancar, salvo que el usuario lo desactive.
  - `install_update` descargaría el `.exe` NSIS de `latest.json` y lo ejecutaría. Eso instala una **segunda copia** por usuario en `%LOCALAPPDATA%\Vellum` y deja el paquete MSIX en la versión vieja.
  - La Store actualiza el paquete ella misma, y sus políticas no admiten un auto-actualizador propio.
  - Una build de Store necesita el updater desactivado, con una feature de Cargo o detectando la identidad de paquete con `GetCurrentPackageFullName`. Es un cambio de código de la app.
  - Desactivarlo contradice el `longDescription` de `tauri.conf.json` («the only network request … is the update check») y deja sin sentido el ajuste «Buscar actualizaciones al iniciar» (`preferences.autoUpdate`): la ficha de la Store y ese ajuste tienen que cambiar en esa build.
- **El paquete no incluye WebView2.** Depende del runtime evergreen, que Windows 11 trae (aquí, 154.0.4258.37). En un Windows 10 sin WebView2, el paquete instalaría pero la ventana no abriría. La Store no tiene una dependencia declarativa para WebView2: habría que exigir Windows 11 o gestionar en la app la ausencia del runtime. La `Section WebView2` de NSIS no tiene equivalente en el MSIX.
  - La decisión se traduce en el `MinVersion` del manifiesto: hoy es `10.0.17763.0` (Windows 10 1809); exigir Windows 11 es `10.0.22000.0`.
- **Solo x64.** El paquete es `ProcessorArchitecture="x64"`. No hay build arm64 ni `.msixbundle`; para la Store hay que decidir si se publica solo x64 o se añade arm64 en un bundle.
- **Escrituras de archivos.**
  - `app_data_dir/themes` (`%APPDATA%\com.vellum.desktop`) y el perfil de WebView2 se redirigen por paquete. Funciona, pero los temas de usuario de una instalación NSIS/MSI previa no se ven desde el MSIX, y desinstalar el paquete los borra.
  - Descargas (`download_dir`) no se virtualiza, así que las exportaciones quedan donde el usuario las espera.
  - Lanzar `explorer` es válido en full trust.
- **La asociación `.cslmap` deja de ser opt-in.** En MSIX se registra siempre al instalar; el checkbox del MSI, desmarcado por defecto, no tiene equivalente. Windows no la convierte en predeterminada si ya hay otra app, pero la ofrece en «Abrir con». Contradice la política de la Story 7.5 y hay que aceptarlo de forma explícita.
- **Identidad de Store.** Partner Center asigna `Identity Name` y `Publisher` al reservar el nombre (`Publisher="CN=<GUID>"`). La Store firma el paquete, así que el certificado de prueba deja de hacer falta. Como cambia el identificador de paquete, los datos virtualizados de esta prueba no migran.
- **Firma fuera de la Store.** Distribuir el `.msix` por descarga directa exige un certificado de confianza pública: el mismo bloqueo de presupuesto que ADR-0003 describe para NSIS.
- **Logos sin variantes.** Los logos no tienen variantes `scale-*` ni `targetsize-*`. WACK no lo marcó («Personalización de marca» y «Recursos de aplicación» pasaron), pero en pantallas con escalado alto Windows reescala la misma imagen.

## Recomendación sobre ADR-0003

La vía Store es viable. El binario de Tauri se empaqueta y se firma sin cambios de código, con el SDK y sin dependencias nuevas. El paquete instala, abre los dos fixtures `.cslmap` y pasa el WACK, con un solo aviso opcional. ADR-0003 puede citar este informe como evidencia.

Aun así, una build de Store necesita como mínimo:

1. Desactivar el updater, y ajustar la descripción de la ficha (`longDescription`) y el ajuste «Buscar actualizaciones al iniciar» (`preferences.autoUpdate`) a esa build.
2. Decidir la política de WebView2 (exigir Windows 11 con `MinVersion 10.0.22000.0` o gestionar la ausencia del runtime).
3. Aceptar que la asociación `.cslmap` deja de ser opt-in, y añadir `.vellummap`.
4. Decidir las arquitecturas: solo x64 o un `.msixbundle` con arm64.
5. Reservar el nombre en Partner Center.

Nada de eso entra en este spike.
