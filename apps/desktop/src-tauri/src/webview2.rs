//! Missing-WebView2 notice for Windows installs that do not bring the runtime
//! themselves (the MSIX package, spike 6.2).
//!
//! NSIS installs WebView2 in its own section, but the Store package cannot declare
//! it as a dependency. On a Windows 10 machine without the runtime, Tauri would fail
//! to create the window and — with the `windows` subsystem — exit without a word.
//! [`notify_missing_runtime`] replaces that silence with a native dialog.

/// Microsoft's Evergreen bootstrapper: the same link `vellum-installer.nsi` downloads.
#[cfg(windows)]
const RUNTIME_DOWNLOAD_URL: &str = "https://go.microsoft.com/fwlink/p/?LinkId=2124703";

/// Title and body of the notice, in Spanish for a Spanish system locale and in
/// English otherwise.
///
/// # Remarks
/// Runs before i18next and `preferences.json` exist, so the OS locale is the only
/// language signal available. Written for players, not developers: no error codes.
#[cfg_attr(not(windows), allow(dead_code))]
fn missing_runtime_message(locale: Option<&str>) -> (&'static str, &'static str) {
    if locale.is_some_and(|tag| tag.to_ascii_lowercase().starts_with("es")) {
        (
            "Vellum necesita un componente de Windows",
            "A este equipo le falta Microsoft Edge WebView2, el componente de Windows que Vellum usa para mostrar sus ventanas.\n\n¿Quieres descargarlo ahora desde Microsoft? Cuando termine de instalarse, vuelve a abrir Vellum.",
        )
    } else {
        (
            "Vellum needs a Windows component",
            "This computer is missing Microsoft Edge WebView2, the Windows component Vellum uses to show its windows.\n\nDownload it from Microsoft now? Once it is installed, open Vellum again.",
        )
    }
}

/// Shows the missing-runtime dialog and, on "Yes", opens the bootstrapper download.
///
/// # Remarks
/// Called before the Tauri builder, so it cannot use any plugin that needs an app
/// handle; `tauri_plugin_opener::open_url` is a free function and does not.
#[cfg(windows)]
pub fn notify_missing_runtime() {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        MessageBoxW, IDYES, MB_ICONINFORMATION, MB_YESNO,
    };

    let wide = |text: &str| text.encode_utf16().chain(Some(0)).collect::<Vec<u16>>();
    let (title, body) = missing_runtime_message(tauri_plugin_os::locale().as_deref());
    let (title, body) = (wide(title), wide(body));

    // SAFETY: both buffers are NUL-terminated UTF-16 that outlive the call, and a
    // null owner window is valid for a dialog shown before any window exists.
    let choice = unsafe {
        MessageBoxW(
            std::ptr::null_mut(),
            body.as_ptr(),
            title.as_ptr(),
            MB_YESNO | MB_ICONINFORMATION,
        )
    };
    if choice == IDYES {
        let _ = tauri_plugin_opener::open_url(RUNTIME_DOWNLOAD_URL, None::<&str>);
    }
}

#[cfg(test)]
mod tests {
    use super::missing_runtime_message;

    #[test]
    fn spanish_locales_get_the_spanish_notice() {
        for locale in ["es", "es-PE", "ES-es"] {
            assert!(missing_runtime_message(Some(locale))
                .0
                .starts_with("Vellum necesita"));
        }
    }

    #[test]
    fn other_or_unknown_locales_fall_back_to_english() {
        for locale in [Some("en-US"), Some("pt-BR"), None] {
            assert!(missing_runtime_message(locale)
                .0
                .starts_with("Vellum needs"));
        }
    }
}
