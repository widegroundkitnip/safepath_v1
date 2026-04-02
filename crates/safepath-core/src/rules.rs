use crate::types::{FileCategory, ManifestEntryDto, RuleConditionDto};

pub fn rule_matches(
    conditions: &[RuleConditionDto],
    entry: &ManifestEntryDto,
    category: FileCategory,
    in_duplicate_group: bool,
) -> bool {
    conditions
        .iter()
        .all(|condition| condition_matches(condition, entry, category, in_duplicate_group))
}

pub fn describe_conditions(conditions: &[RuleConditionDto]) -> Vec<String> {
    conditions.iter().map(describe_condition).collect()
}

fn condition_matches(
    condition: &RuleConditionDto,
    entry: &ManifestEntryDto,
    category: FileCategory,
    in_duplicate_group: bool,
) -> bool {
    match condition {
        RuleConditionDto::FileCategory { category: expected } => category == *expected,
        RuleConditionDto::ExtensionIn { extensions } => entry
            .extension
            .as_deref()
            .map(|extension| {
                let extension = extension.to_ascii_lowercase();
                extensions
                    .iter()
                    .any(|candidate| candidate.eq_ignore_ascii_case(&extension))
            })
            .unwrap_or(false),
        RuleConditionDto::FilenameContains { value } => entry
            .name
            .to_ascii_lowercase()
            .contains(&value.to_ascii_lowercase()),
        RuleConditionDto::PathContains { value } => entry
            .path
            .to_ascii_lowercase()
            .contains(&value.to_ascii_lowercase()),
        RuleConditionDto::SizeRange {
            min_bytes,
            max_bytes,
        } => {
            let meets_min = min_bytes.map(|min| entry.size_bytes >= min).unwrap_or(true);
            let meets_max = max_bytes.map(|max| entry.size_bytes <= max).unwrap_or(true);
            meets_min && meets_max
        }
        RuleConditionDto::NoExtension => entry.extension.is_none(),
        RuleConditionDto::DuplicateGroup => in_duplicate_group,
        RuleConditionDto::AnyOf { conditions } => conditions
            .iter()
            .any(|nested| condition_matches(nested, entry, category, in_duplicate_group)),
        RuleConditionDto::AllOf { conditions } => conditions
            .iter()
            .all(|nested| condition_matches(nested, entry, category, in_duplicate_group)),
        RuleConditionDto::Always => true,
    }
}

fn describe_condition(condition: &RuleConditionDto) -> String {
    match condition {
        RuleConditionDto::FileCategory { category } => format!("file category is {category:?}"),
        RuleConditionDto::ExtensionIn { extensions } => {
            format!("extension in [{}]", extensions.join(", "))
        }
        RuleConditionDto::FilenameContains { value } => {
            format!("filename contains `{value}`")
        }
        RuleConditionDto::PathContains { value } => format!("path contains `{value}`"),
        RuleConditionDto::SizeRange {
            min_bytes,
            max_bytes,
        } => match (min_bytes, max_bytes) {
            (Some(min), Some(max)) => format!("size between {min} and {max} bytes"),
            (Some(min), None) => format!("size at least {min} bytes"),
            (None, Some(max)) => format!("size at most {max} bytes"),
            (None, None) => "size range always matches".to_string(),
        },
        RuleConditionDto::NoExtension => "file has no extension".to_string(),
        RuleConditionDto::DuplicateGroup => "entry belongs to a duplicate group".to_string(),
        RuleConditionDto::AnyOf { conditions } => format!(
            "any of: {}",
            conditions
                .iter()
                .map(describe_condition)
                .collect::<Vec<_>>()
                .join("; ")
        ),
        RuleConditionDto::AllOf { conditions } => format!(
            "all of: {}",
            conditions
                .iter()
                .map(describe_condition)
                .collect::<Vec<_>>()
                .join("; ")
        ),
        RuleConditionDto::Always => "always".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::rule_matches;
    use crate::types::{FileCategory, ManifestEntryDto, ManifestEntryKind, RuleConditionDto};

    #[test]
    fn supports_nested_condition_groups() {
        let entry = ManifestEntryDto {
            entry_id: "entry-1".to_string(),
            job_id: "job".to_string(),
            source_root: "/source".to_string(),
            path: "/source/Screenshot-2024.png".to_string(),
            relative_path: "Screenshot-2024.png".to_string(),
            name: "Screenshot-2024.png".to_string(),
            entry_kind: ManifestEntryKind::File,
            size_bytes: 2_048,
            extension: Some("png".to_string()),
            is_hidden: false,
            created_at_epoch_ms: None,
            modified_at_epoch_ms: None,
            media_date_epoch_ms: None,
            media_date_source: None,
        };

        let conditions = vec![RuleConditionDto::AllOf {
            conditions: vec![
                RuleConditionDto::FileCategory {
                    category: FileCategory::Image,
                },
                RuleConditionDto::AnyOf {
                    conditions: vec![
                        RuleConditionDto::FilenameContains {
                            value: "screenshot".to_string(),
                        },
                        RuleConditionDto::PathContains {
                            value: "desktop".to_string(),
                        },
                    ],
                },
                RuleConditionDto::SizeRange {
                    min_bytes: Some(1_024),
                    max_bytes: Some(10_000),
                },
            ],
        }];

        assert!(rule_matches(
            &conditions,
            &entry,
            FileCategory::Image,
            false
        ));
    }
}
