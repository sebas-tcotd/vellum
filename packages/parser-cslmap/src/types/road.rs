use serde::{Deserialize, Serialize};

/// Road hierarchy derived from width fallback (AC4).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum RoadHierarchy {
    Small,
    Medium,
    Large,
}

#[cfg(test)]
mod tests {
    use crate::dlc_fallback;
    use super::RoadHierarchy;

    #[test]
    fn fallback_hierarchy_by_width() {
        assert_eq!(dlc_fallback::classify_by_width(8.0), RoadHierarchy::Small);
        assert_eq!(dlc_fallback::classify_by_width(16.0), RoadHierarchy::Medium);
        assert_eq!(dlc_fallback::classify_by_width(30.0), RoadHierarchy::Large);
    }
}
