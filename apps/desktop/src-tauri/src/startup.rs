use std::sync::{Mutex, OnceLock};

static PENDING_FILE_PATH: OnceLock<Mutex<Option<String>>> = OnceLock::new();

fn pending_file_path() -> &'static Mutex<Option<String>> {
    PENDING_FILE_PATH.get_or_init(|| Mutex::new(None))
}

/// Reads `std::env::args()` for a `.cslmap` path passed by the OS (Windows file
/// association, Story 7.5 AC1) and stores it for the frontend to claim.
///
/// # Remarks
/// Called once from `.setup()`, before any window exists. The first non-flag
/// argument after argv[0] that ends in `.cslmap` or `.vellummap` (case-insensitive) is treated
/// as the file to open; anything else (dev server flags, no argument at all)
/// leaves the pending slot empty.
pub fn capture_startup_file_path() {
    let path = std::env::args()
        .skip(1)
        .find(|arg| !arg.starts_with('-') && is_city_document(arg));
    if let Some(path) = path {
        if let Ok(mut pending) = pending_file_path().lock() {
            *pending = Some(path);
        }
    }
}

/// Whether `path` names a city document Vellum opens: `.cslmap` or `.vellummap`.
fn is_city_document(path: &str) -> bool {
    let lower = path.to_lowercase();
    lower.ends_with(".cslmap") || lower.ends_with(".vellummap")
}

/// Returns and clears the city document path (`.cslmap` or `.vellummap`) the app was launched with, if any.
///
/// # Remarks
/// Mutates the process-wide pending-path slot: the first caller (the frontend,
/// once its listeners are mounted) consumes it, so subsequent calls return
/// `None` — same pattern as `updater::get_pending_update`.
///
/// # Errors
/// Never fails — returns `Option`, not `Result`; a poisoned lock and "no
/// startup file" both collapse to `None`.
#[must_use]
#[tauri::command]
pub fn get_startup_file_path() -> Option<String> {
    pending_file_path().lock().ok()?.take()
}

#[cfg(test)]
mod tests {
    use super::{get_startup_file_path, is_city_document, pending_file_path};

    /// Single test — `PENDING_FILE_PATH` is a process-wide static, so a second
    /// test touching it in parallel would race.
    #[test]
    fn get_startup_file_path_returns_and_clears_the_stored_path() {
        assert_eq!(get_startup_file_path(), None, "starts empty");

        if let Ok(mut pending) = pending_file_path().lock() {
            *pending = Some("C:\\Cities\\altavento.cslmap".to_string());
        }

        assert_eq!(
            get_startup_file_path(),
            Some("C:\\Cities\\altavento.cslmap".to_string()),
            "first read returns it"
        );
        assert_eq!(
            get_startup_file_path(),
            None,
            "second read finds it cleared"
        );
    }

    #[test]
    fn both_city_documents_are_accepted_case_insensitively() {
        assert!(is_city_document("C:\\Cities\\altavento.CSLMAP"));
        assert!(is_city_document("/Users/me/Costa Tijuca.vellummap"));
        assert!(!is_city_document("/Users/me/theme.vellumstyle"));
        assert!(!is_city_document("/Users/me/raw.quire"));
    }
}
