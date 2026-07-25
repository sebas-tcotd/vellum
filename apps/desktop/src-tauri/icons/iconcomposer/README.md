# Generating the Vellum app icon (PNG + Liquid Glass)

Vellum ships two icon sources:

1. **Flat PNG** — covers Windows, Linux, iOS, Android, and the `tauri dev` / pre-macOS-26 fallback.
2. **`.icon` (Icon Composer)** — the adaptive Liquid Glass icon, compiled to `Assets.car` and bundled only into the packaged macOS `.app`.

Tauri's `tauri icon` CLI only accepts a flat PNG/SVG — it has no support for the `.icon` bundle format. The Liquid Glass variant has to be compiled separately with Xcode/`actool` and injected into the bundle manually.

## 1. Flat PNG (all platforms)

Export a flattened PNG from Icon Composer (or any source): **square, ≥1024×1024, RGBA with transparency, straight corners** (do not round them yourself — each platform applies its own mask).

```bash
cd apps/desktop
pnpm tauri icon path/to/icon-flat.png
```

This regenerates everything under `src-tauri/icons/` (`.icns`, `.ico`, PNGs, iOS/Android sizes) and is the only step needed for non-macOS targets.

**If the icon in the Dock/taskbar doesn't change after this** (`pnpm dev` or `pnpm tauri build` still shows the old artwork): Cargo's incremental build cache didn't notice the icon files changed as a `build.rs` dependency, so it's reusing the previously compiled binary. Force it:

```bash
cd apps/desktop/src-tauri
rm -rf target/debug/build/vellum-* target/debug/incremental
cd ..
pnpm dev
```

If that's not enough, nuke the whole target dir (`rm -rf target`) and rebuild. On macOS, also `killall Dock` to rule out LaunchServices icon caching.

## 2. Liquid Glass `.icon` → `Assets.car` (macOS 26+)

`actool` cannot reliably compile a Liquid Glass `.icon` file when invoked standalone from the command line — it either crashes or silently no-ops (empty `partial.plist`, no `Assets.car`). The only path that reliably worked was building through a real Xcode project, which runs the full asset-catalog compiler pipeline instead of a bare `actool` invocation.

### 2.1 Correct file placement

The `.icon` file must be named to match the target's `ASSETCATALOG_COMPILER_APPICON_NAME` build setting (default `AppIcon`), and placed **directly in the target's source folder — NOT inside `Assets.xcassets/`**:

```
MyApp/
├── AppIcon.icon        ← correct: next to source files
├── Assets.xcassets/
│   └── AppIcon.appiconset/   ← can stay empty or be removed
├── ContentView.swift
└── MyAppApp.swift
```

**Common mistake:** dropping `AppIcon.icon` inside `Assets.xcassets/` instead. `actool` silently ignores it there — the build succeeds but produces an empty/placeholder `Assets.car`. This is exactly what happened on the first attempts: `actool` returned no errors/warnings but never emitted the icon data.

With `PBXFileSystemSynchronizedRootGroup` (Xcode 16+), any file dropped into that folder is picked up automatically — no `.pbxproj` editing needed.

### 2.2 Build

Create a disposable macOS App target in Xcode (File → New → Project → macOS → App), delete its default `Assets.xcassets`, and place your `AppIcon.icon` per §2.1. Confirm `ASSETCATALOG_COMPILER_APPICON_NAME` (Build Settings) matches the file name, then build:

```bash
xcodebuild -project Scratch.xcodeproj -scheme Scratch -configuration Debug build
```

or `Cmd+B` in Xcode. **Do a clean build (`Cmd+Shift+K`) before building** if you're iterating — a stale cached `Assets.car` from a previous default-icon build can otherwise get reused, which is exactly what produced Apple's generic blue placeholder icon on our second attempt instead of the real artwork.

### 2.3 Locate the compiled `Assets.car`

```
~/Library/Developer/Xcode/DerivedData/<App>-<hash>/Build/Products/Debug/<App>.app/Contents/Resources/Assets.car
```

Sanity-check it actually contains your artwork (not a default placeholder) before wiring it into Vellum:

```bash
xcrun assetutil --info Assets.car | grep -E '"AssetType"|"Name"'
```

Look for your actual layer/asset names (e.g. custom SVG layer names) — if you only see generic `Color-N` / template gradients, the build used Xcode's default icon, not yours.

### 2.4 Copy into the repo

```bash
cp path/to/Assets.car apps/desktop/src-tauri/icons/iconcomposer/Assets.car
```

## 3. Wiring `Assets.car` into the Tauri bundle

Two pieces of config, already in place in this repo — reproduce them if setting up fresh:

**`apps/desktop/src-tauri/Info.plist`** (merged into the bundle's `Info.plist`):

```xml
<key>CFBundleIconName</key>
<string>AppIcon</string>
```

This tells macOS to prefer `Assets.car`'s `AppIcon` over the legacy `icon.icns` fallback.

**`apps/desktop/src-tauri/tauri.conf.json`**:

```json
"bundle": {
  "macOS": {
    "infoPlist": "Info.plist",
    "files": {
      "Resources/Assets.car": "icons/iconcomposer/Assets.car"
    }
  }
}
```

Note the direction: `macOS.files` keys are **destination paths relative to `Contents/`**, values are **source paths relative to `src-tauri/`** — the opposite of `bundle.resources`. Confirmed empirically: the reverse mapping fails the build with `does not exist`.

## 4. Build and verify

```bash
cd apps/desktop
pnpm tauri build --bundles app
```

```bash
ls target/release/bundle/macos/Vellum.app/Contents/Resources/Assets.car
/usr/libexec/PlistBuddy -c "Print :CFBundleIconName" target/release/bundle/macos/Vellum.app/Contents/Info.plist
```

macOS/the Dock aggressively cache app icons. If the icon doesn't look updated after opening the new build:

```bash
killall Dock
```

## Recap: why the direct `.xcassets` approach failed

Earlier attempts wrapped `AppIcon.icon` inside a hand-built `Assets.xcassets` and ran bare `actool` against it — this crashed once and silently no-op'd another time. The fixes that got it working:

1. Move `AppIcon.icon` out of `Assets.xcassets` per §2.1 (the actually-supported layout).
2. Build via a real Xcode target/`xcodebuild`, not a raw `actool` CLI invocation.
3. Clean build folder before each attempt to avoid stale/placeholder `Assets.car` reuse.
