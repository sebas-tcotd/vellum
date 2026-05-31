/// Detects the debug .cslmap format where the first segment ID is duplicated (Gotcha 4).
/// Standard format: segs are unique. Debug format: segs[0] == segs[1].
/// Only triggers when there are at least 3 segs to reduce false-positive risk.
#[must_use]
pub fn detect_debug_format(segs: &[String]) -> bool {
    segs.len() >= 3 && segs[0] == segs[1]
}

/// Removes the duplicate leading segment ID present in debug-format files.
pub fn normalize_debug_segs(segs: &mut Vec<String>) {
    if detect_debug_format(segs) {
        segs.remove(0);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_debug_format_when_first_two_equal() {
        let segs = vec!["101".to_string(), "101".to_string(), "102".to_string()];
        assert!(detect_debug_format(&segs));
    }

    #[test]
    fn does_not_detect_debug_format_for_standard() {
        let segs = vec!["101".to_string(), "102".to_string()];
        assert!(!detect_debug_format(&segs));
    }

    #[test]
    fn normalizes_debug_segs_removes_duplicate() {
        let mut segs = vec!["101".to_string(), "101".to_string(), "102".to_string()];
        normalize_debug_segs(&mut segs);
        assert_eq!(segs, vec!["101".to_string(), "102".to_string()]);
    }

    #[test]
    fn normalize_is_noop_for_standard_format() {
        let mut segs = vec!["101".to_string(), "102".to_string()];
        normalize_debug_segs(&mut segs);
        assert_eq!(segs, vec!["101".to_string(), "102".to_string()]);
    }
}
