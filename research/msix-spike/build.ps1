# Spike 6.2 - disposable MSIX prototype. Not a production target, not wired into CI.
#
# Builds target\msix-spike\Vellum_<version>.0_x64.msix from the release vellum.exe using
# only the installed Windows SDK (makepri, makeappx, signtool) and signs it with a
# self-signed TEST certificate kept in Cert:\CurrentUser\My.
#
#   powershell -ExecutionPolicy Bypass -File research/msix-spike/build.ps1 [-SkipBuild]
#
# Trusting the certificate, installing, running WACK and cleaning up are manual steps
# (see findings.md). This script never touches LocalMachine stores and needs no elevation.
# Kept ASCII-only on purpose: Windows PowerShell 5.1 reads BOM-less files as ANSI.

[CmdletBinding()]
param(
    # Reuse target\release\vellum.exe instead of running `pnpm tauri build --no-bundle`.
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$SrcTauri = Join-Path $RepoRoot 'apps\desktop\src-tauri'
$OutDir = Join-Path $RepoRoot 'target\msix-spike'
$Layout = Join-Path $OutDir 'layout'
$SdkBin = 'C:\Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64'
$CertFriendlyName = 'Vellum MSIX spike (test only)'

function Invoke-Tool {
    param([string]$Exe, [string[]]$Arguments)
    Write-Host ">> $(Split-Path $Exe -Leaf) $($Arguments -join ' ')"
    & $Exe @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$(Split-Path $Exe -Leaf) failed with exit code $LASTEXITCODE" }
}

foreach ($tool in 'makepri.exe', 'makeappx.exe', 'signtool.exe') {
    if (-not (Test-Path (Join-Path $SdkBin $tool))) { throw "Windows SDK 10.0.26100 tool missing: $tool" }
}
$MakePri = Join-Path $SdkBin 'makepri.exe'
$MakeAppx = Join-Path $SdkBin 'makeappx.exe'
$SignTool = Join-Path $SdkBin 'signtool.exe'

# --- Identity: tauri.conf.json is the source of truth; the manifest must agree with it.
$conf = Get-Content (Join-Path $SrcTauri 'tauri.conf.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$version = "$($conf.version).0"   # MSIX requires four parts
$publisher = "CN=$($conf.bundle.publisher)"

$manifestSource = Join-Path $PSScriptRoot 'AppxManifest.xml'
[xml]$manifest = Get-Content $manifestSource -Raw -Encoding UTF8
$identity = $manifest.Package.Identity
if ($identity.Version -ne $version) { throw "AppxManifest Version '$($identity.Version)' != tauri.conf.json '$version'" }
if ($identity.Publisher -ne $publisher) { throw "AppxManifest Publisher '$($identity.Publisher)' != '$publisher'" }
if ($manifest.Package.Properties.DisplayName -ne $conf.productName) { throw "DisplayName != productName '$($conf.productName)'" }

# --- 1. Release binary (frontend is embedded in vellum.exe).
if (-not $SkipBuild) {
    Write-Host '>> pnpm tauri build --no-bundle'
    Push-Location (Join-Path $RepoRoot 'apps\desktop')
    try {
        & pnpm tauri build --no-bundle
        if ($LASTEXITCODE -ne 0) { throw "pnpm tauri build failed with exit code $LASTEXITCODE" }
    } finally { Pop-Location }
}
$exe = Join-Path $RepoRoot 'target\release\vellum.exe'
if (-not (Test-Path $exe)) { throw "Release binary not found: $exe" }

# --- 2. Package layout: exe + bundled themes (resource_dir\themes) + existing logos.
# Only the build outputs are replaced; other files here (wack-report.xml, VellumSpike.cer) survive.
$priConfig = Join-Path $OutDir 'priconfig.xml'
$msix = Join-Path $OutDir "Vellum_${version}_x64.msix"
foreach ($stale in $Layout, $priConfig, $msix) {
    if (Test-Path $stale) { Remove-Item $stale -Recurse -Force }
}
New-Item -ItemType Directory -Force (Join-Path $Layout 'themes'), (Join-Path $Layout 'Assets') | Out-Null
Copy-Item $exe $Layout
Copy-Item (Join-Path $SrcTauri 'resources\themes\*') (Join-Path $Layout 'themes')
foreach ($logo in 'Square44x44Logo.png', 'Square150x150Logo.png', 'StoreLogo.png') {
    Copy-Item (Join-Path $SrcTauri "icons\$logo") (Join-Path $Layout 'Assets')
}
Copy-Item $manifestSource (Join-Path $Layout 'AppxManifest.xml')

# --- 3. resources.pri
Invoke-Tool $MakePri @('createconfig', '/cf', $priConfig, '/dq', 'en-US', '/o')
Invoke-Tool $MakePri @('new', '/pr', $Layout, '/cf', $priConfig, '/mn', (Join-Path $Layout 'AppxManifest.xml'),
    '/of', (Join-Path $Layout 'resources.pri'), '/o')

# --- 4. Pack
Invoke-Tool $MakeAppx @('pack', '/d', $Layout, '/p', $msix, '/o')

# --- 5. Self-signed test certificate (CurrentUser\My; reused across runs).
$cert = Get-ChildItem Cert:\CurrentUser\My |
    Where-Object { $_.Subject -eq $publisher -and $_.FriendlyName -eq $CertFriendlyName -and $_.NotAfter -gt (Get-Date) } |
    Select-Object -First 1
if (-not $cert) {
    Write-Host ">> New-SelfSignedCertificate $publisher"
    $cert = New-SelfSignedCertificate -Type Custom -Subject $publisher -FriendlyName $CertFriendlyName `
        -KeyUsage DigitalSignature -KeyAlgorithm RSA -KeyLength 2048 -HashAlgorithm SHA256 `
        -CertStoreLocation 'Cert:\CurrentUser\My' -NotAfter (Get-Date).AddMonths(3) `
        -TextExtension @('2.5.29.37={text}1.3.6.1.5.5.7.3.3', '2.5.29.19={text}')
}
$cer = Join-Path $OutDir 'VellumSpike.cer'
Export-Certificate -Cert $cert -FilePath $cer -Type CERT | Out-Null

# --- 6. Sign. `signtool verify /pa` is expected to fail until the .cer is trusted.
Invoke-Tool $SignTool @('sign', '/fd', 'SHA256', '/s', 'My', '/sha1', $cert.Thumbprint, $msix)
Write-Host '>> signtool verify /pa (expected to fail until the test certificate is trusted)'
& $SignTool verify /pa $msix
$verifyExit = $LASTEXITCODE

Write-Host ''
Write-Host "Package:     $msix"
Write-Host "Certificate: $cer  (thumbprint $($cert.Thumbprint))"
Write-Host "Verify /pa:  exit $verifyExit"
exit 0
