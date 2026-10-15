# Builds Vellum Bridge in Release, packs VellumBridge-X.zip (folder VellumBridge/), attaches it to
# the GitHub release bridge-vX and publishes that release without making it the "latest" one.
#
# release-please creates bridge-vX as a draft with no asset; this script is the manual step that
# turns it into a downloadable release for players without Steam Workshop. Windows only, run by
# the maintainer: it never runs in CI and it needs `gh` authenticated with write access.
#
# Preconditions are all checked BEFORE compiling: the version matches BridgeInfo.Version, the
# bridge tree has no changes, the release exists, and the code matches the release's tag.
param(
    # Bridge version to publish (X.Y.Z). Default: the highest bridge-v* release, draft or not.
    [string]$Version,
    [string]$ManagedDir = "C:\Program Files (x86)\Steam\steamapps\common\Cities_Skylines\Cities_Data\Managed"
)
$ErrorActionPreference = "Stop"

$bridgeRel = "tools/vellum-bridge"
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))

# Runs a native command and returns its stdout; throws if it exits non-zero.
function Invoke-Native([string]$Exe, [string[]]$Arguments) {
    $output = & $Exe @Arguments
    if ($LASTEXITCODE -ne 0) { throw "'$Exe $($Arguments -join ' ')' failed with exit code $LASTEXITCODE." }
    return ($output -join "`n")
}
function Invoke-GhJson([string[]]$Arguments) {
    return (Invoke-Native "gh" $Arguments) | ConvertFrom-Json
}

# 1. Resolve the version from the releases (drafts are only visible through the list endpoint).
$repo = (Invoke-Native "gh" @("repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner")).Trim()
if (-not $repo) { throw "Could not determine the GitHub repository with 'gh repo view'." }
$releases = @(Invoke-GhJson @("api", "repos/$repo/releases?per_page=100"))

if (-not $Version) {
    $candidates = @($releases | Where-Object { $_.tag_name -match '^bridge-v(\d+\.\d+\.\d+)$' } |
        Sort-Object { [version]($_.tag_name -replace '^bridge-v', '') } -Descending)
    if ($candidates.Count -eq 0) { throw "No bridge-v* release exists. Let release-please open one first." }
    $Version = $candidates[0].tag_name -replace '^bridge-v', ''
}
if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw "Version must be X.Y.Z, got '$Version'." }
$tag = "bridge-v$Version"

# 2. The version in the code must be the version being published.
$infoPath = Join-Path $PSScriptRoot "src\BridgeInfo.cs"
$info = Get-Content -LiteralPath $infoPath -Raw
if ($info -notmatch 'const string Version\s*=\s*"([^"]+)"') { throw "Could not read Version from $infoPath." }
$codeVersion = $Matches[1]
if ($codeVersion -ne $Version) {
    throw "BridgeInfo.Version is $codeVersion but the release tag is $tag ($Version). Nothing was built."
}

# 3. The bridge tree must be clean (tracked and untracked changes).
$dirty = Invoke-Native "git" @("-C", $repoRoot, "status", "--porcelain", "--", $bridgeRel)
if ($dirty.Trim()) {
    throw "Working tree has uncommitted changes in $bridgeRel; commit or discard them first:`n$dirty"
}

# 4. The release must exist.
$release = $releases | Where-Object { $_.tag_name -eq $tag } | Select-Object -First 1
if (-not $release) { throw "The release $tag does not exist on $repo. Nothing was built." }

# 5. The code must be the one the release points at. A draft has no tag yet, so fall back to its target.
$ref = $null
$target = $release.target_commitish
foreach ($candidate in @("refs/tags/$tag", $(if ($target) { "origin/$target" }), $target)) {
    if (-not $candidate) { continue }
    & git -C $repoRoot rev-parse --verify --quiet "$candidate^{commit}" *> $null
    if ($LASTEXITCODE -eq 0) { $ref = $candidate; break }
}
if (-not $ref) { throw "Cannot resolve $tag (or the release target) locally; run 'git fetch --tags' and retry. Nothing was built." }
& git -C $repoRoot diff --quiet $ref -- $bridgeRel
if ($LASTEXITCODE -ne 0) {
    throw "$bridgeRel differs from $ref; the zip would not match release $tag. Nothing was built."
}

# 5b. Environment: CS1 Managed folder, gh authentication, and latest must be a desktop release now.
if (-not (Test-Path -LiteralPath $ManagedDir -PathType Container)) {
    throw "ManagedDir '$ManagedDir' does not exist or is not a folder. Nothing was built."
}
Invoke-Native "gh" @("auth", "status") | Out-Null
$latestBefore = Invoke-GhJson @("api", "repos/$repo/releases/latest")
if ($latestBefore.tag_name -notmatch '^v\d') {
    throw "releases/latest is '$($latestBefore.tag_name)', not a desktop vX release; fix it on GitHub before publishing. Nothing was built."
}

# 6. Build.
$env:CS1_MANAGED_DIR = $ManagedDir
$project = Join-Path $PSScriptRoot "VellumBridge.csproj"
dotnet build $project -c Release -nologo -v q
if ($LASTEXITCODE -ne 0) { throw "Build failed." }
$dll = Join-Path $PSScriptRoot "bin\Release\net35\VellumBridge.dll"
if (-not (Test-Path -LiteralPath $dll)) { throw "Build did not produce $dll." }

# 7. Zip: only VellumBridge/VellumBridge.dll, entry names with forward slashes.
$work = Join-Path ([IO.Path]::GetTempPath()) ("vellum-bridge-publish-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory $work | Out-Null
try {
    $zipName = "VellumBridge-$Version.zip"
    $zip = Join-Path $work $zipName
    Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
    $archive = [IO.Compression.ZipFile]::Open($zip, [IO.Compression.ZipArchiveMode]::Create)
    try {
        $entry = $archive.CreateEntry("VellumBridge/VellumBridge.dll", [IO.Compression.CompressionLevel]::Optimal)
        $in = [IO.File]::OpenRead($dll)
        $out = $entry.Open()
        try { $in.CopyTo($out) } finally { $out.Dispose(); $in.Dispose() }
    } finally { $archive.Dispose() }

    # 8. Replace the asset (delete the same-named one first so reruns never duplicate it).
    foreach ($asset in @($release.assets | Where-Object { $_.name -eq $zipName })) {
        Invoke-Native "gh" @("api", "-X", "DELETE", "repos/$repo/releases/assets/$($asset.id)") | Out-Null
    }
    Invoke-Native "gh" @("api", "-X", "POST",
        "https://uploads.github.com/repos/$repo/releases/$($release.id)/assets?name=$zipName",
        "-H", "Content-Type: application/zip", "--input", $zip) | Out-Null

    # 9. Publish without taking over "latest" (the desktop updater and landing read latest).
    Invoke-Native "gh" @("api", "-X", "PATCH", "repos/$repo/releases/$($release.id)",
        "-F", "draft=false", "-f", "make_latest=false") | Out-Null
} finally {
    Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
}

# 10. latest must still be a desktop release (vX), never this bridge release.
$latest = Invoke-GhJson @("api", "repos/$repo/releases/latest")
if ($latest.tag_name -notmatch '^v\d') {
    throw "releases/latest is now '$($latest.tag_name)', not a desktop vX release. Fix it on GitHub before anyone updates."
}
Write-Host "Published $tag with $zipName; latest is still $($latest.tag_name)."
