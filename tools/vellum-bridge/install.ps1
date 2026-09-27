# Compila Vellum Bridge y lo instala en la carpeta local de mods de CS1 (Windows).
#
# CS1 solo recarga un mod en caliente cuando cambia su *carpeta* dentro de Addons\Mods: el
# vigilante de archivos .dll llama a OnPluginAdded con la ruta del DLL, que falla el
# Directory.Exists y no hace nada. Por eso no basta con sobrescribir VellumBridge.dll: aquí se
# borra la carpeta del mod (CS1 descarga el viejo) y se mueve dentro una carpeta ya completa
# preparada fuera de Mods (CS1 carga el nuevo). La versión de ensamblado 1.0.* del csproj hace
# que Mono no reutilice el ensamblado viejo con el mismo nombre.
param(
    [string]$ManagedDir = "C:\Program Files (x86)\Steam\steamapps\common\Cities_Skylines\Cities_Data\Managed"
)
$ErrorActionPreference = "Stop"

$env:CS1_MANAGED_DIR = $ManagedDir
$project = Join-Path $PSScriptRoot "VellumBridge.csproj"
dotnet build $project -c Release -nologo -v q
if ($LASTEXITCODE -ne 0) { throw "La compilación falló." }
$dll = Join-Path $PSScriptRoot "bin\Release\net35\VellumBridge.dll"

$addons = Join-Path $env:LOCALAPPDATA "Colossal Order\Cities_Skylines\Addons"
$target = Join-Path $addons "Mods\VellumBridge"
# Fuera de Mods (CS1 vigila Mods) y en el mismo volumen, para que el Move sea un renombrado.
$staging = Join-Path $addons "VellumBridge.staging"

if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
New-Item -ItemType Directory $staging | Out-Null
Copy-Item $dll $staging

if (Test-Path $target) {
    Remove-Item $target -Recurse -Force
    # Deja que el vigilante vea el borrado antes de la carpeta nueva.
    Start-Sleep -Seconds 2
}
Move-Item $staging $target

$version = [Reflection.AssemblyName]::GetAssemblyName((Join-Path $target "VellumBridge.dll")).Version
Write-Host "Instalado VellumBridge.dll (ensamblado $version) en $target"
