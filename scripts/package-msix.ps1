# Package an existing x64 release executable. Never builds or signs it.
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Executable,
    [string]$Version,
    [string]$OutputDirectory,
    [string]$SdkBin
)
$ErrorActionPreference = 'Stop'
$RepoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$SourceRoot = Join-Path $RepoRoot 'apps\desktop\src-tauri'
$conf = Get-Content -LiteralPath (Join-Path $SourceRoot 'tauri.conf.json') -Raw | ConvertFrom-Json
if (-not $Version) { $Version = $conf.version }
if ($Version -notmatch '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$') {
    throw 'Version must be a stable X.Y.Z release (no prerelease or metadata).'
}
foreach ($part in $Version.Split('.')) {
    if ($part.Length -gt 5 -or [int]$part -gt 65535) { throw 'Version components must be in range 0..65535.' }
}
if ($Version -ne $conf.version) { throw "Release version $Version differs from Tauri version $($conf.version)." }
$PackageVersion = "$Version.0"
$InputExe = (Resolve-Path -LiteralPath $Executable).Path
if (-not (Test-Path -LiteralPath $InputExe -PathType Leaf)) { throw 'Executable must be a file.' }
# Reject non-PE and non-x64 inputs before invoking the SDK.
$stream = [IO.File]::OpenRead($InputExe)
try {
    $reader = New-Object IO.BinaryReader($stream)
    if ($reader.ReadUInt16() -ne 0x5A4D) { throw 'Executable is not a PE file.' }
    $stream.Position = 0x3c
    $peOffset = $reader.ReadUInt32()
    $stream.Position = $peOffset
    if ($reader.ReadUInt32() -ne 0x00004550 -or $reader.ReadUInt16() -ne 0x8664) { throw 'Executable must be an x64 PE file.' }
} finally { $stream.Dispose() }
$metadata = [Diagnostics.FileVersionInfo]::GetVersionInfo($InputExe)
if ($metadata.ProductName -cne 'Vellum') { throw "Executable ProductName must be Vellum, got '$($metadata.ProductName)'." }
if ($metadata.ProductVersion -cne $conf.version) { throw "Executable ProductVersion '$($metadata.ProductVersion)' differs from Tauri version '$($conf.version)'." }
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $RepoRoot 'target\msix' }
$OutDir = [IO.Path]::GetFullPath($OutputDirectory)
$TargetRoot = [IO.Path]::GetFullPath((Join-Path $RepoRoot 'target')) + [IO.Path]::DirectorySeparatorChar
if (-not $OutDir.StartsWith($TargetRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'OutputDirectory must be inside this repository target directory.' }
if ($InputExe.StartsWith($OutDir.TrimEnd('\', '/') + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'OutputDirectory cannot contain the input executable.' }
# Existing junctions/symlinks may escape the verified target directory.
for ($path = $OutDir; $path -and $path.Length -ge $RepoRoot.Length; $path = Split-Path $path -Parent) {
    if ((Test-Path -LiteralPath $path) -and ((Get-Item -LiteralPath $path).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw "Output path contains a reparse point: $path" }
}
if (-not $SdkBin) {
    $sdkRoot = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\bin'
    if (-not (Test-Path -LiteralPath $sdkRoot -PathType Container)) { throw 'Windows SDK x64 tools not installed.' }
    $SdkBin = Get-ChildItem -LiteralPath $sdkRoot -Directory | Where-Object { $_.Name -match '^10\.0\.\d+\.0$' } |
        Sort-Object { [version]$_.Name } -Descending | ForEach-Object { Join-Path $_.FullName 'x64' } |
        Where-Object { (Test-Path (Join-Path $_ 'makepri.exe')) -and (Test-Path (Join-Path $_ 'makeappx.exe')) } | Select-Object -First 1
}
foreach ($tool in 'makepri.exe', 'makeappx.exe') {
    if (-not $SdkBin -or -not (Test-Path -LiteralPath (Join-Path $SdkBin $tool) -PathType Leaf)) { throw "Windows SDK x64 tool missing: $tool" }
}
function Invoke-Sdk([string]$Tool, [string[]]$Arguments) {
    & (Join-Path $SdkBin $Tool) @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Tool failed with exit code $LASTEXITCODE" }
}
# Validate every declared resource before writing any output. Preserve Tauri's
# relative resource layout; themes also occupy the app's preferred themes path.
$Resources = @()
foreach ($pattern in $conf.bundle.resources) {
    if ([IO.Path]::IsPathRooted($pattern) -or $pattern -match '(^|[\\/])\.\.([\\/]|$)' -or $pattern -match 'installer-bootstrap') { throw "Unsupported runtime resource: $pattern" }
    $matches = @(Get-ChildItem -Path (Join-Path $SourceRoot $pattern) -File -ErrorAction Stop)
    if ($matches.Count -eq 0) { throw "Runtime resource missing: $pattern" }
    $Resources += $matches
}
$Logos = @('Square44x44Logo.png', 'Square150x150Logo.png', 'StoreLogo.png')
foreach ($logo in $Logos) {
    if (-not (Test-Path -LiteralPath (Join-Path $SourceRoot "icons\$logo") -PathType Leaf)) { throw "Logo missing: $logo" }
}
$InputHash = (Get-FileHash -LiteralPath $InputExe -Algorithm SHA256).Hash
# A fresh staging directory avoids recursively deleting any caller-owned path.
$Stage = Join-Path $OutDir ([guid]::NewGuid().ToString('N'))
$Layout = Join-Path $Stage 'layout'
New-Item -ItemType Directory -Path (Join-Path $Layout 'Assets') -Force | Out-Null
Copy-Item -LiteralPath $InputExe -Destination (Join-Path $Layout 'vellum.exe')
foreach ($resource in $Resources) {
    $relative = $resource.FullName.Substring($SourceRoot.Length + 1)
    $destination = Join-Path $Layout $relative
    New-Item -ItemType Directory -Path (Split-Path $destination -Parent) -Force | Out-Null
    Copy-Item -LiteralPath $resource.FullName -Destination $destination
    if ($relative -like 'resources\themes\*') {
        New-Item -ItemType Directory -Path (Join-Path $Layout 'themes') -Force | Out-Null
        Copy-Item -LiteralPath $resource.FullName -Destination (Join-Path $Layout "themes\$($resource.Name)")
    }
}
foreach ($logo in $Logos) { Copy-Item -LiteralPath (Join-Path $SourceRoot "icons\$logo") -Destination (Join-Path $Layout 'Assets') }
[xml]$manifest = Get-Content -LiteralPath (Join-Path $RepoRoot 'apps\desktop\msix\AppxManifest.xml') -Raw
$manifest.Package.Identity.Version = $PackageVersion
$manifest.Save((Join-Path $Layout 'AppxManifest.xml'))
$PriConfig = Join-Path $Stage 'priconfig.xml'
Invoke-Sdk 'makepri.exe' @('createconfig', '/cf', $PriConfig, '/dq', 'en-US', '/o')
Invoke-Sdk 'makepri.exe' @('new', '/pr', $Layout, '/cf', $PriConfig, '/mn', (Join-Path $Layout 'AppxManifest.xml'), '/of', (Join-Path $Layout 'resources.pri'), '/o')
$Package = Join-Path $Stage "VellumCityMaps_${PackageVersion}_x64.msix"
Invoke-Sdk 'makeappx.exe' @('pack', '/d', $Layout, '/p', $Package, '/o')
$Unpacked = Join-Path $Stage 'unpacked'
Invoke-Sdk 'makeappx.exe' @('unpack', '/p', $Package, '/d', $Unpacked, '/o')
if ((Get-FileHash -LiteralPath (Join-Path $Unpacked 'vellum.exe') -Algorithm SHA256).Hash -ne $InputHash -or (Get-FileHash -LiteralPath $InputExe -Algorithm SHA256).Hash -ne $InputHash) { throw 'Packaged executable SHA256 differs from input.' }
if (Test-Path -LiteralPath (Join-Path $Unpacked 'AppxSignature.p7x')) { throw 'MSIX must be unsigned for Microsoft certification.' }
if (-not (Test-Path -LiteralPath $Package -PathType Leaf) -or (Get-Item -LiteralPath $Package).Length -eq 0) { throw 'SDK produced no package.' }
$FinalPackage = Join-Path $OutDir (Split-Path $Package -Leaf)
if ((Test-Path -LiteralPath $FinalPackage) -and -not (Test-Path -LiteralPath $FinalPackage -PathType Leaf)) { throw 'Package destination must be a file.' }
if ((Test-Path -LiteralPath $FinalPackage) -and ((Get-Item -LiteralPath $FinalPackage).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Package destination is a reparse point.' }
Copy-Item -LiteralPath $Package -Destination $FinalPackage -Force
Write-Host "Unsigned MSIX: $FinalPackage"
Write-Host "Executable SHA256: $InputHash"
if ($env:GITHUB_OUTPUT) { "msix-path=$FinalPackage" | Out-File -LiteralPath $env:GITHUB_OUTPUT -Append -Encoding utf8 }
