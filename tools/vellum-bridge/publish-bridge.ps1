# Builds Vellum Bridge in Release, packs VellumBridge-X.zip (folder VellumBridge/), attaches it to
# the GitHub release bridge-vX and publishes that release without making it the "latest" one.
#
# release-please creates bridge-vX as a draft with no asset; this script is the manual step that
# turns it into a downloadable release for players without Steam Workshop. Windows only, run by
# the maintainer: it never runs in CI and it needs `gh` authenticated with write access.
#
# Preconditions are all checked BEFORE compiling: the version matches BridgeInfo.Version, the
# bridge tree has no changes, the release exists, and the code matches the release's tag.
#
# With -Workshop it builds nothing: it downloads the zip already attached to the published
# bridge-vX release and pushes exactly that content to Steam Workshop item 3815903587 with
# steamcmd, reusing the Steam session saved on this machine (see the README).
param(
    # Bridge version to publish (X.Y.Z). Default: the highest bridge-v* release, draft or not.
    [string]$Version,
    [string]$ManagedDir = "C:\Program Files (x86)\Steam\steamapps\common\Cities_Skylines\Cities_Data\Managed",
    # Update the Workshop item from the published release zip instead of building and publishing.
    [switch]$Workshop,
    # Steam account whose saved steamcmd session is used (-Workshop only). Never stored anywhere.
    [string]$SteamUser,
    # steamcmd executable (-Workshop only): a command on PATH or a full path.
    [string]$SteamCmd = "steamcmd"
)
$ErrorActionPreference = "Stop"

$workshopAppId = "255710"
$workshopItemId = "3815903587"

$bridgeRel = "tools/vellum-bridge"
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))

# Runs a native command and returns its stdout; throws if it exits non-zero.
function Invoke-Native([string]$Exe, [string[]]$Arguments) {
    $output = & $Exe @Arguments
    if ($LASTEXITCODE -ne 0) { throw "'$Exe $($Arguments -join ' ')' failed with exit code $LASTEXITCODE." }
    return ($output -join "`n")
}
# Windows PowerShell 5.1 emits a JSON array as ONE object; enumerate it so a list of releases
# is one item per release there too (pwsh 7 already does this).
function Invoke-GhJson([string[]]$Arguments) {
    $parsed = (Invoke-Native "gh" $Arguments) | ConvertFrom-Json
    foreach ($item in $parsed) { $item }
}
# Runs a native command without letting stderr abort the script (Windows PowerShell 5.1 turns
# redirected stderr into terminating errors under "Stop"); returns its output lines and exit code.
function Invoke-NativeLines([string]$Exe, [string[]]$Arguments, [switch]$Echo) {
    $ErrorActionPreference = "Continue"
    $lines = @(& $Exe @Arguments 2>&1 | ForEach-Object {
            $line = "$_"
            if ($Echo) { Write-Host $line }
            $line
        })
    return [pscustomobject]@{ Lines = $lines; ExitCode = $LASTEXITCODE }
}
# The release-please section of version $Ver in a CHANGELOG.md, without its "## X" heading.
function Get-ChangelogSection([string]$Text, [string]$Ver) {
    $lines = @(($Text -replace "`r", "") -split "`n")
    $heading = "^##\s+\[?" + [regex]::Escape($Ver) + "\]?(\s|\(|$)"
    $start = -1
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($start -lt 0) {
            if ($lines[$i] -match $heading) { $start = $i + 1 }
        } elseif ($lines[$i] -match '^##\s') {
            if ($i -le $start) { return "" }
            return ($lines[$start..($i - 1)] -join "`n")
        }
    }
    if ($start -lt 0 -or $start -ge $lines.Count) { return "" }
    return ($lines[$start..($lines.Count - 1)] -join "`n")
}
# Release-please Markdown to the plain text the Workshop change note shows: links keep their text,
# commit hashes go, "### Features" becomes "Features:", version headings and bold markers go.
function ConvertTo-PlainNote([string]$Text) {
    if (-not $Text) { return "" }
    $t = $Text -replace "`r", ""
    $t = $t -replace '\s*\(\[[0-9a-f]{7,40}\]\([^)]*\)\)', ''
    $t = $t -replace '\[([^\]]*)\]\([^)]*\)', '$1'
    $t = $t -replace '(?m)^#{1,2}[ \t].*$', ''
    $t = $t -replace '(?m)^#{3,}[ \t]*(.+?)[ \t]*$', '$1:'
    $t = $t -replace '\*\*', ''
    $t = $t -replace "\n{3,}", "`n`n"
    return $t.Trim()
}
# A VDF quoted string: backslashes and double quotes escaped.
function ConvertTo-VdfString([string]$Value) {
    return '"' + ($Value -replace '\\', '\\' -replace '"', '\"') + '"'
}

# 0. -Workshop: local preconditions first (cheap, and nothing below talks to Steam before them).
if ($Workshop) {
    # gh and git write UTF-8; decode it as such so accents in the public change note survive.
    [Console]::OutputEncoding = New-Object Text.UTF8Encoding $false
    if (-not $SteamUser) {
        throw "-Workshop needs -SteamUser <account>, the account whose steamcmd session is saved on this machine. Nothing was uploaded."
    }
    $steamCmdPath = (Get-Command $SteamCmd -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1).Path
    if (-not $steamCmdPath) {
        throw "steamcmd was not found ('$SteamCmd'); install it or pass -SteamCmd <path to steamcmd.exe>. Nothing was uploaded."
    }
}

# 1. Resolve the version from the releases (drafts are only visible through the list endpoint).
$repo = (Invoke-Native "gh" @("repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner")).Trim()
if (-not $repo) { throw "Could not determine the GitHub repository with 'gh repo view'." }
$releases = @(Invoke-GhJson @("api", "repos/$repo/releases?per_page=100"))

if (-not $Version) {
    # -Workshop uploads a published release, so a newer release-please draft must not shadow it.
    $candidates = @($releases | Where-Object { $_.tag_name -match '^bridge-v(\d+\.\d+\.\d+)$' -and -not ($Workshop -and $_.draft) } |
        Sort-Object { [version]($_.tag_name -replace '^bridge-v', '') } -Descending)
    if ($candidates.Count -eq 0) {
        if ($Workshop) { throw "No published bridge-v* release exists. Run publish-bridge.ps1 without -Workshop first. Nothing was uploaded." }
        throw "No bridge-v* release exists. Let release-please open one first."
    }
    $Version = $candidates[0].tag_name -replace '^bridge-v', ''
}
if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw "Version must be X.Y.Z, got '$Version'." }
$tag = "bridge-v$Version"

# W. -Workshop: upload exactly the published zip to the Workshop item; never build (steps 2-10 skipped).
if ($Workshop) {
    $zipName = "VellumBridge-$Version.zip"
    $release = $releases | Where-Object { $_.tag_name -eq $tag } | Select-Object -First 1
    if (-not $release) { throw "The release $tag does not exist on $repo. Nothing was uploaded." }
    if ($release.draft) {
        throw "The release $tag is still a draft. Run publish-bridge.ps1 without -Workshop first to attach $zipName and publish it. Nothing was uploaded."
    }
    if (-not @($release.assets | Where-Object { $_.name -eq $zipName })) {
        throw "The release $tag has no $zipName asset. Run publish-bridge.ps1 without -Workshop first. Nothing was uploaded."
    }

    # W1. Change note: this version's section of the bridge CHANGELOG at the tag, else the release body.
    $note = ""
    $noteSource = "the body of release $tag"
    $changelog = Invoke-NativeLines "git" @("-C", $repoRoot, "show", "refs/tags/${tag}:$bridgeRel/CHANGELOG.md")
    if ($changelog.ExitCode -eq 0) {
        $note = ConvertTo-PlainNote (Get-ChangelogSection ($changelog.Lines -join "`n") $Version)
        if ($note) { $noteSource = "$bridgeRel/CHANGELOG.md at $tag" }
    }
    if (-not $note) { $note = ConvertTo-PlainNote $release.body }
    if (-not $note) {
        throw "No change note for ${Version}: $bridgeRel/CHANGELOG.md at $tag has no $Version section and the body of release $tag is empty. Nothing was uploaded."
    }

    $work = Join-Path ([IO.Path]::GetTempPath()) ("vellum-bridge-workshop-" + [Guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory $work | Out-Null
    $itemFailed = $false
    try {
        # W2. Download the attached zip and check it holds only VellumBridge/VellumBridge.dll.
        Invoke-Native "gh" @("release", "download", $tag, "--repo", $repo, "--pattern", $zipName, "--dir", $work) | Out-Null
        $zip = Join-Path $work $zipName
        if (-not (Test-Path -LiteralPath $zip)) { throw "gh did not download $zipName from $tag. Nothing was uploaded." }
        Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
        $archive = [IO.Compression.ZipFile]::OpenRead($zip)
        try { $entries = @($archive.Entries | ForEach-Object { $_.FullName }) } finally { $archive.Dispose() }
        if ($entries.Count -ne 1 -or $entries[0] -ne "VellumBridge/VellumBridge.dll") {
            $found = if ($entries.Count) { $entries -join ", " } else { "(no entries)" }
            throw "$zipName must contain only VellumBridge/VellumBridge.dll; found: $found. Nothing was uploaded."
        }
        $extracted = Join-Path $work "content"
        [IO.Compression.ZipFile]::ExtractToDirectory($zip, $extracted)
        $contentFolder = Join-Path $extracted "VellumBridge"

        # W3. VDF: only the content and the change note; nothing else about the item changes.
        $vdf = Join-Path $work "workshop_item.vdf"
        $vdfText = "`"workshopitem`"`n{`n" +
        "`t`"appid`"`t`t`"$workshopAppId`"`n" +
        "`t`"publishedfileid`"`t`t`"$workshopItemId`"`n" +
        "`t`"contentfolder`"`t`t$(ConvertTo-VdfString $contentFolder)`n" +
        "`t`"changenote`"`t`t$(ConvertTo-VdfString $note)`n}`n"
        [IO.File]::WriteAllText($vdf, $vdfText, (New-Object Text.UTF8Encoding $false))
        Write-Host "Change note from $($noteSource):"
        Write-Host $note

        # W4. steamcmd with the saved session; its exit code alone is not trusted.
        $steam = Invoke-NativeLines $steamCmdPath @("+@NoPromptForPassword", "1", "+login", $SteamUser,
            "+workshop_build_item", $vdf, "+quit") -Echo
        $text = $steam.Lines -join "`n"
        if ($text -cmatch '(?m)^Logging in user .*FAILED \(|Login Failure') {
            throw "steamcmd could not log in as '$SteamUser' from a saved session. Log in once by hand with 'steamcmd +login $SteamUser', then rerun. Nothing was uploaded."
        }
        $succeeded = $steam.ExitCode -eq 0 -and
        @($steam.Lines | Where-Object { $_.Trim() -eq "Success." }).Count -gt 0 -and
        -not ($text -match 'ERROR!')
        if (-not $succeeded) { $itemFailed = $true }
    } finally {
        Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
    }

    if ($itemFailed) {
        # A plain message, not a thrown error: the next step is a manual procedure, not a bug.
        foreach ($line in @(
                "WARNING: steamcmd could not update Workshop item $workshopItemId (exit code $($steam.ExitCode)).",
                "Update it by hand with the Content Manager from the same zip: download $zipName from release $tag,",
                "unzip it into Addons/Mods/ and update item $workshopItemId as described in",
                "'Actualizar el Workshop a mano' in $bridgeRel/README.md.")) {
            [Console]::Error.WriteLine($line)
        }
        exit 1
    }
    Write-Host "Updated Workshop item $workshopItemId with $zipName ($tag)."
    exit 0
}

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
