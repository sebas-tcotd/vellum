# Vellum Desktop — Desktop architecture

`apps/desktop` is Vellum's **composition root**: the only part of the monorepo
that assembles `@vellum/ui`, the parser, the renderers, the theme engine and the
domain package into a native Tauri application. It does not own domain logic. Its
job is to adapt Tauri—IPC commands, native plugins, menus, filesystem access and
the updater—to the ports expected by the UI.

## Structure

```text
apps/desktop/
├── src/                    # Tauri-specific TypeScript adapters
│   ├── main.tsx            # Entry point; assembles the concrete adapters
│   ├── hooks/
│   │   ├── use-parse-cslmap.ts  # parse_cslmap + file dialog + progress
│   │   └── use-export-png.ts    # export_png with raw bytes, not base64
│   ├── export/             # legacy/tiled selection, coordinator, benchmarks
│   └── window-close-cancel.ts   # waits for export cancellation before closing
└── src-tauri/              # Rust backend
    ├── src/
    │   ├── main.rs         # calls vellum_lib::run()
    │   ├── lib.rs          # Tauri builder, plugins, menu, updater and cleanup
    │   ├── commands.rs     # native commands exposed to the frontend
    │   ├── updater.rs      # background check and pending-update recovery
    │   ├── city_data.rs, errors.rs, ipc_contract.rs
    │   └── export/         # sessions, framing, SVG and tile composition
    └── resources/themes/   # built-in .vellumstyle files
```

## Entry points

- **Frontend:** `src/main.tsx` renders the React shell and injects concrete
  adapters for parsing, PNG/SVG export and export coordination.
- **Rust:** `src-tauri/src/main.rs` delegates to `vellum_lib::run()` in `lib.rs`.

The frontend also exposes a development-only raster benchmark hook. That hook is
useful for measuring the export path without making benchmark code part of the
user-facing API.

## Tauri commands

| Command                                                                 | Source        | Purpose                                                                                |
| ----------------------------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------- |
| `parse_cslmap`                                                          | `commands.rs` | Parses a `.cslmap` on a blocking thread and returns `CityData`.                        |
| `load_themes`                                                           | `commands.rs` | Reads built-in `.vellumstyle` files.                                                   |
| `export_png`                                                            | `commands.rs` | Writes already-rendered PNG bytes to disk.                                             |
| `open_export_folder`                                                    | `commands.rs` | Reveals an exported file in the operating system's file browser.                       |
| `begin_export`, `append_export_chunk`, `finish_export`, `cancel_export` | `commands.rs` | Manage a transactional tiled-export session.                                           |
| `get_pending_update`                                                    | `updater.rs`  | Returns and clears an update notification that arrived before the UI listener mounted. |

## Registered plugins and startup

Vellum registers the dialog, store, opener and updater plugins. During
`lib.rs::run()` it also:

1. Creates the native menu.
2. Registers the shared export-session manager.
3. Registers the command handler.
4. Removes orphaned `.part` export files from interrupted sessions.
5. Starts the updater check in the background.
6. Cleans up active export sessions when the window or application closes.

The native menu adds **Preferences…** with `CmdOrCtrl+,`. Its event is forwarded
as `vellum://open-preferences`, which `@vellum/ui` uses to open the preferences
panel.

## Preferences and updates

`tauri-plugin-store` persists `preferences.json`. The UI owns preference writes;
the desktop backend reads `autoUpdateEnabled` when the updater runs. The default is
`false`.

At startup, `updater::check_for_updates` checks GitHub Releases in the background.
When it finds a newer version, it stores a pending payload and emits
`vellum://update-available`. If automatic updates are enabled, it downloads,
installs and restarts the app. `get_pending_update` covers the race where the
event arrives before the frontend has mounted its listener.

## Development commands

```bash
pnpm dev
pnpm dev:vite
pnpm build
pnpm build:vite
pnpm test
pnpm test:e2e
```

## Testing

The desktop package has unit coverage around its Tauri adapters and export
coordination, Rust tests around export sessions and tile composition, and a
Playwright smoke spec under `apps/desktop/tests/e2e`. The E2E suite currently
checks that the app starts and the document is visible; it does not yet exercise
the complete drag-and-drop → render → export journey.

## Architectural boundary

Parsing, road classification and transit reconstruction live in `packages/*`,
not in `apps/desktop`. This boundary is deliberate: replacing a native adapter
should not require rewriting the domain or UI layers. The export pipeline is the
most stateful native area because large maps are streamed through a transactional
Rust session instead of being held as one giant buffer.
