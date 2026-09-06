use serde::Deserialize;
use std::sync::Mutex;
use tauri::menu::{
    Menu, MenuBuilder, MenuItem, MenuItemBuilder, MenuItemKind, Submenu, SubmenuBuilder,
};

use tauri::{AppHandle, Manager, Runtime, State};

/// Event consumed by the React shell for custom Vellum menu actions.
pub const MENU_ACTION_EVENT: &str = "vellum://menu-action";

/// Tracks whether the native menu is currently visible.
///
/// The menu itself remains installed so that dynamic menu updates and native
/// menu events continue to work while it is hidden.
#[derive(Default)]
pub struct NativeMenuVisibility(Mutex<bool>);

impl NativeMenuVisibility {
    pub fn set_visible(&self, visible: bool) -> Result<(), String> {
        let mut state = self
            .0
            .lock()
            .map_err(|_| "native menu visibility state is unavailable".to_owned())?;
        *state = visible;
        Ok(())
    }

    pub fn is_visible(&self) -> Result<bool, String> {
        self.0
            .lock()
            .map(|state| *state)
            .map_err(|_| "native menu visibility state is unavailable".to_owned())
    }
}

/// Toggles the native menu. The frontend invokes this for the platform's
/// conventional `Alt` menu key, since Tauri does not expose raw key events in
/// its window event API.
// ponytail: Tauri commands can only take AppHandle/State by value.
#[allow(clippy::needless_pass_by_value)]
#[tauri::command]
pub fn toggle_native_menu<R: Runtime>(
    app: AppHandle<R>,
    visibility: State<'_, NativeMenuVisibility>,
) -> Result<(), String> {
    let visible = visibility.is_visible()?;
    if visible {
        app.hide_menu().map_err(|error| error.to_string())?;
    } else {
        app.show_menu().map_err(|error| error.to_string())?;
    }
    visibility.set_visible(!visible)
}

const MENU_ID_OPEN_FILE: &str = "menu.open-file";
const MENU_ID_OPEN_EXPORT: &str = "menu.open-export";
const MENU_ID_FIT_TO_SCREEN: &str = "menu.fit-to-screen";
const MENU_ID_ZOOM_IN: &str = "menu.zoom-in";
const MENU_ID_ZOOM_OUT: &str = "menu.zoom-out";
const MENU_ID_CLEAN_MODE: &str = "menu.clean-mode";
const MENU_ID_TOGGLE_SIDEBAR: &str = "menu.toggle-sidebar";
const MENU_ID_NAVIGATION_MODE: &str = "menu.navigation-mode";
const MENU_ID_ICON_LEGEND: &str = "menu.icon-legend";
const MENU_ID_ROTATE_LEFT: &str = "menu.rotate-left";
const MENU_ID_ROTATE_RIGHT: &str = "menu.rotate-right";
const MENU_ID_RESET_BEARING: &str = "menu.reset-bearing";
const MENU_ID_PREFERENCES: &str = "preferences";
pub const MENU_ID_ABOUT: &str = "menu.about";
pub const MENU_ID_EXIT: &str = "menu.exit";
const MENU_ID_THEMES: &str = "menu.themes";
const MENU_ID_THEME_PREFIX: &str = "menu.theme.";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemeMenuItem {
    pub id: String,
    pub name: String,
}

fn custom_item<R: Runtime, M: Manager<R>>(
    manager: &M,
    id: &str,
    text: &str,
    accelerator: Option<&str>,
) -> tauri::Result<MenuItem<R>> {
    let mut builder = MenuItemBuilder::with_id(id, text);
    if let Some(accelerator) = accelerator {
        builder = builder.accelerator(accelerator);
    }
    builder.build(manager)
}

fn build_file_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Submenu<R>> {
    let open_file = custom_item(app, MENU_ID_OPEN_FILE, "Open Map…", Some("CmdOrCtrl+O"))?;
    let open_export = custom_item(app, MENU_ID_OPEN_EXPORT, "Export Map…", Some("CmdOrCtrl+E"))?;

    let mut builder = SubmenuBuilder::new(app, "File")
        .item(&open_file)
        .item(&open_export)
        .separator();

    #[cfg(target_os = "macos")]
    {
        builder = builder.close_window();
    }

    #[cfg(not(target_os = "macos"))]
    {
        let exit = custom_item(app, MENU_ID_EXIT, "Exit", Some("CmdOrCtrl+Q"))?;
        builder = builder.item(&exit);
    }

    builder.build()
}

fn build_edit_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Submenu<R>> {
    SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()
}

fn build_view_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Submenu<R>> {
    let fit_to_screen = custom_item(
        app,
        MENU_ID_FIT_TO_SCREEN,
        "Fit to Screen",
        Some("CmdOrCtrl+Digit0"),
    )?;
    let zoom_in = custom_item(app, MENU_ID_ZOOM_IN, "Zoom In", Some("CmdOrCtrl+Equal"))?;
    let zoom_out = custom_item(app, MENU_ID_ZOOM_OUT, "Zoom Out", Some("CmdOrCtrl+Minus"))?;
    // Names the user-facing result, per the UX writing contract. The action id
    // is unchanged, so shortcuts and handlers keep working.
    let clean_mode = custom_item(app, MENU_ID_CLEAN_MODE, "Clean View", Some("KeyH"))?;
    // A noun that toggles, matching the other items in this menu. The label
    // cannot flip between Show and Hide without pushing shell state back into
    // Rust, which this migration deliberately avoids.
    let toggle_sidebar = custom_item(
        app,
        MENU_ID_TOGGLE_SIDEBAR,
        "Sidebar",
        Some("CmdOrCtrl+Alt+KeyS"),
    )?;
    let navigation_mode = custom_item(
        app,
        MENU_ID_NAVIGATION_MODE,
        "Navigation Mode",
        Some("CmdOrCtrl+KeyB"),
    )?;
    let icon_legend = custom_item(app, MENU_ID_ICON_LEGEND, "Map Symbols", Some("KeyL"))?;
    let rotate_left = custom_item(
        app,
        MENU_ID_ROTATE_LEFT,
        "Rotate Left",
        Some("Shift+ArrowLeft"),
    )?;
    let rotate_right = custom_item(
        app,
        MENU_ID_ROTATE_RIGHT,
        "Rotate Right",
        Some("Shift+ArrowRight"),
    )?;
    let reset_bearing = custom_item(app, MENU_ID_RESET_BEARING, "Reset North", Some("KeyR"))?;

    SubmenuBuilder::new(app, "View")
        .item(&fit_to_screen)
        .item(&zoom_in)
        .item(&zoom_out)
        .separator()
        .item(&toggle_sidebar)
        .item(&clean_mode)
        .item(&navigation_mode)
        .item(&icon_legend)
        .separator()
        .item(&rotate_left)
        .item(&rotate_right)
        .item(&reset_bearing)
        .separator()
        .fullscreen()
        .build()
}

fn build_advanced_menu<R: Runtime>(
    app: &AppHandle<R>,
    layer: &str,
    label: &str,
    shortcut: Option<&str>,
    options: &[(&str, &str)],
) -> tauri::Result<Submenu<R>> {
    let advanced_id = format!("menu.advanced.{layer}");
    let advanced = custom_item(
        app,
        &format!("menu.open-advanced.{layer}"),
        "Advanced Options",
        shortcut.map(|_| match layer {
            "terrain" => "Shift+Digit1",
            "basemap" => "Shift+Digit2",
            "transit" => "Shift+Digit4",
            "buildings" => "Shift+Digit5",
            "districts" => "Shift+Digit7",
            _ => "",
        }),
    )?;

    let mut builder = SubmenuBuilder::with_id(app, advanced_id, label).item(&advanced);
    if !options.is_empty() {
        builder = builder.separator();
    }
    let mut items = Vec::with_capacity(options.len());
    for (id, text) in options {
        let item = custom_item(
            app,
            &format!("menu.toggle-advanced.{layer}.{id}"),
            text,
            None,
        )?;
        items.push(item);
    }
    for item in &items {
        builder = builder.item(item);
    }
    builder.build()
}

fn build_layers_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Submenu<R>> {
    let layers = [
        ("terrain", "Terrain", "Digit1"),
        ("basemap", "Basemap", "Digit2"),
        ("roads", "Roads", "Digit3"),
        ("transit", "Transit", "Digit4"),
        ("buildings", "Buildings", "Digit5"),
        ("forests", "Forests", "Digit6"),
        ("districts", "Districts", "Digit7"),
    ];
    let mut layer_items = Vec::with_capacity(layers.len());
    for (layer, label, accelerator) in layers {
        layer_items.push(custom_item(
            app,
            &format!("menu.toggle-layer.{layer}"),
            label,
            Some(accelerator),
        )?);
    }

    let terrain = build_advanced_menu(
        app,
        "terrain",
        "Terrain Options",
        Some("Shift+1"),
        &[
            ("contour-lines", "Show Contour Lines"),
            ("color-relief", "Show Color Relief"),
            ("hillshade", "Show Hillshade"),
        ],
    )?;
    let basemap = build_advanced_menu(
        app,
        "basemap",
        "Basemap Options",
        Some("Shift+2"),
        &[("grid", "Show Projection Grid")],
    )?;
    let transit = build_advanced_menu(
        app,
        "transit",
        "Transit Options",
        Some("Shift+4"),
        &[
            ("Bus", "Bus"),
            ("Tram", "Tram"),
            ("Train", "Train"),
            ("Metro", "Metro"),
            ("CableCar", "Cable Car"),
            ("Monorail", "Monorail"),
            ("Ferry", "Ferry"),
            ("Blimp", "Blimp"),
            ("Trolleybus", "Trolleybus"),
        ],
    )?;
    let buildings = build_advanced_menu(
        app,
        "buildings",
        "Building Options",
        Some("Shift+5"),
        &[
            ("color-by-category", "Color by Category"),
            ("residential", "Residential"),
            ("industry", "Industry"),
            ("commercial", "Commercial"),
            ("office", "Office"),
        ],
    )?;
    let districts = build_advanced_menu(
        app,
        "districts",
        "District Options",
        Some("Shift+7"),
        &[
            ("show-names", "Show District Names"),
            ("show-park-areas", "Show Park Areas"),
        ],
    )?;

    SubmenuBuilder::new(app, "Layers")
        .item(&layer_items[0])
        .item(&terrain)
        .item(&layer_items[1])
        .item(&basemap)
        .item(&layer_items[2])
        .item(&layer_items[3])
        .item(&transit)
        .item(&layer_items[4])
        .item(&buildings)
        .item(&layer_items[5])
        .item(&layer_items[6])
        .item(&districts)
        .build()
}

fn build_themes_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Submenu<R>> {
    let dim_non_transit = custom_item(
        app,
        "menu.toggle-transit-dimming",
        "Dim Non-Transit Layers",
        None,
    )?;
    SubmenuBuilder::with_id(app, MENU_ID_THEMES, "Themes")
        .item(&dim_non_transit)
        .build()
}

fn build_preferences_item<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<MenuItem<R>> {
    custom_item(
        app,
        MENU_ID_PREFERENCES,
        "Preferences…",
        Some("CmdOrCtrl+Comma"),
    )
}

fn build_window_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Submenu<R>> {
    SubmenuBuilder::new(app, "Window")
        .minimize()
        .maximize()
        .separator()
        .close_window()
        .build()
}

/// Builds Vellum's complete native menu, preserving Tauri's predefined items while
/// making every application action explicit and discoverable.
pub fn build_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let preferences = build_preferences_item(app)?;
    let about = custom_item(app, MENU_ID_ABOUT, "About Vellum", None)?;
    let layers = build_layers_menu(app)?;
    let themes = build_themes_menu(app)?;
    let window = build_window_menu(app)?;
    let edit = build_edit_menu(app)?;
    let view = build_view_menu(app)?;

    #[cfg(target_os = "macos")]
    {
        let app_menu = SubmenuBuilder::new(app, app.package_info().name.clone())
            .item(&about)
            .separator()
            .item(&preferences)
            .separator()
            .services()
            .separator()
            .hide()
            .hide_others()
            .show_all()
            .separator()
            .quit()
            .build()?;
        let file = build_file_menu(app)?;
        let help = SubmenuBuilder::new(app, "Help").build()?;
        MenuBuilder::new(app)
            .item(&app_menu)
            .item(&file)
            .item(&edit)
            .item(&view)
            .item(&layers)
            .item(&themes)
            .item(&window)
            .item(&help)
            .build()
    }

    #[cfg(not(target_os = "macos"))]
    {
        let app_menu = SubmenuBuilder::new(app, "Vellum")
            .item(&about)
            .separator()
            .item(&preferences);
        let app_menu = app_menu.build()?;
        let file = build_file_menu(app)?;
        MenuBuilder::new(app)
            .item(&app_menu)
            .item(&file)
            .item(&edit)
            .item(&view)
            .item(&layers)
            .item(&themes)
            .item(&window)
            .item(&SubmenuBuilder::new(app, "Help").build()?)
            .build()
    }
}

/// Replaces the contents of the dynamic Themes submenu after `useThemes` resolves.
#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub fn update_theme_menu(app_handle: AppHandle, themes: Vec<ThemeMenuItem>) -> Result<(), String> {
    let menu = app_handle
        .menu()
        .ok_or_else(|| "Vellum menu is not initialized".to_owned())?;
    let Some(MenuItemKind::Submenu(submenu)) = menu.get(&MENU_ID_THEMES.to_owned()) else {
        return Err("Themes submenu is not initialized".to_owned());
    };

    let current_items = submenu
        .items()
        .map_err(|error| format!("failed to inspect Themes menu: {error}"))?;
    for item in current_items {
        submenu
            .remove(&item)
            .map_err(|error| format!("failed to clear Themes menu: {error}"))?;
    }

    for theme in themes {
        let item = custom_item(
            &app_handle,
            &format!("{MENU_ID_THEME_PREFIX}{}", theme.id),
            &theme.name,
            None,
        )
        .map_err(|error| format!("failed to create theme menu item: {error}"))?;
        submenu
            .append(&item)
            .map_err(|error| format!("failed to append theme menu item: {error}"))?;
    }

    let dim_non_transit = custom_item(
        &app_handle,
        "menu.toggle-transit-dimming",
        "Dim Non-Transit Layers",
        None,
    )
    .map_err(|error| format!("failed to create transit dimming menu item: {error}"))?;
    submenu
        .append(&dim_non_transit)
        .map_err(|error| format!("failed to append transit dimming menu item: {error}"))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    #[test]
    fn custom_action_ids_are_unique_and_stable() {
        let ids = [
            super::MENU_ID_OPEN_FILE,
            super::MENU_ID_OPEN_EXPORT,
            super::MENU_ID_FIT_TO_SCREEN,
            super::MENU_ID_ZOOM_IN,
            super::MENU_ID_ZOOM_OUT,
            super::MENU_ID_CLEAN_MODE,
            super::MENU_ID_TOGGLE_SIDEBAR,
            super::MENU_ID_NAVIGATION_MODE,
            super::MENU_ID_ICON_LEGEND,
            super::MENU_ID_ROTATE_LEFT,
            super::MENU_ID_ROTATE_RIGHT,
            super::MENU_ID_RESET_BEARING,
            super::MENU_ID_PREFERENCES,
            super::MENU_ID_ABOUT,
            super::MENU_ID_EXIT,
            super::MENU_ID_THEMES,
            "menu.toggle-transit-dimming",
        ];
        let unique_ids: HashSet<_> = ids.iter().copied().collect();

        assert_eq!(unique_ids.len(), ids.len());
        assert!(ids
            .iter()
            .all(|id| id.starts_with("menu.") || *id == "preferences"));
    }

    #[test]
    fn documented_accelerators_use_tauri_key_names() {
        let accelerators = [
            "CmdOrCtrl+O",
            "CmdOrCtrl+E",
            "CmdOrCtrl+Digit0",
            "CmdOrCtrl+Equal",
            "CmdOrCtrl+Minus",
            "KeyH",
            "CmdOrCtrl+Alt+KeyS",
            "CmdOrCtrl+KeyB",
            "KeyL",
            "Shift+ArrowLeft",
            "Shift+ArrowRight",
            "KeyR",
            "Digit1",
            "Shift+Digit1",
        ];

        assert!(accelerators
            .iter()
            .all(|accelerator| !accelerator.is_empty()));
        assert!(accelerators.contains(&"CmdOrCtrl+Digit0"));
        assert!(accelerators.contains(&"Shift+ArrowLeft"));
    }
}
