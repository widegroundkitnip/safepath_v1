use crate::types::{
    ChecksumMode, DuplicatePolicy, FallbackBehavior, FileCategory, PlanOptionsDto,
    PlannedActionKind, PresetDefinitionDto, ProjectSafetyMode, ReviewMode, RuleConditionDto,
    RuleDto, RuleSetDto,
};

pub fn built_in_presets() -> Vec<PresetDefinitionDto> {
    vec![
        general_organize_preset(),
        downloads_cleanup_preset(),
        screenshots_preset(),
        camera_import_preset(),
        project_safe_preset(),
        duplicate_review_preset(),
    ]
}

pub fn get_preset(preset_id: &str) -> Option<PresetDefinitionDto> {
    built_in_presets()
        .into_iter()
        .find(|preset| preset.preset_id == preset_id)
}

fn general_organize_preset() -> PresetDefinitionDto {
    PresetDefinitionDto {
        preset_id: "general_organize".to_string(),
        name: "General Organize".to_string(),
        description: "Conservative everyday sorting by file category.".to_string(),
        rule_set: RuleSetDto {
            rule_set_id: "general_organize_rules".to_string(),
            name: "General organize".to_string(),
            rules: vec![
                category_rule(
                    "images_by_date",
                    "Images by date",
                    100,
                    FileCategory::Image,
                    "Images/{file_year}/{file_month}",
                    "Route images into dated folders.",
                ),
                category_rule(
                    "videos_by_date",
                    "Videos by date",
                    90,
                    FileCategory::Video,
                    "Videos/{file_year}/{file_month}",
                    "Route videos into dated folders.",
                ),
                category_rule(
                    "audio",
                    "Audio",
                    80,
                    FileCategory::Audio,
                    "Audio",
                    "Route audio files into Audio.",
                ),
                category_rule(
                    "documents_by_year",
                    "Documents by year",
                    70,
                    FileCategory::Document,
                    "Documents/{file_year}",
                    "Route documents into yearly folders.",
                ),
                category_rule(
                    "archives",
                    "Archives",
                    60,
                    FileCategory::Archive,
                    "Archives",
                    "Route archives into Archives.",
                ),
                RuleDto {
                    rule_id: "installers".to_string(),
                    name: "Installers".to_string(),
                    priority: 50,
                    conditions: vec![RuleConditionDto::AnyOf {
                        conditions: vec![RuleConditionDto::ExtensionIn {
                            extensions: vec![
                                "app".to_string(),
                                "pkg".to_string(),
                                "dmg".to_string(),
                            ],
                        }],
                    }],
                    action_kind: PlannedActionKind::Move,
                    destination_template: Some("Installers".to_string()),
                    explanation: "Route installers into Installers.".to_string(),
                },
                RuleDto {
                    rule_id: "no_extension".to_string(),
                    name: "No extension".to_string(),
                    priority: 40,
                    conditions: vec![RuleConditionDto::NoExtension],
                    action_kind: PlannedActionKind::Move,
                    destination_template: Some("Unknown".to_string()),
                    explanation: "Route files without an extension into Unknown.".to_string(),
                },
            ],
        },
        plan_options: PlanOptionsDto {
            checksum_mode: ChecksumMode::Off,
            duplicate_policy: DuplicatePolicy::FlagOnly,
            review_mode: ReviewMode::Standard,
            project_safety_mode: ProjectSafetyMode::On,
            fallback_behavior: FallbackBehavior::Skip,
        },
    }
}

fn project_safe_preset() -> PresetDefinitionDto {
    PresetDefinitionDto {
        preset_id: "project_safe".to_string(),
        name: "Project Safe".to_string(),
        description: "Organize around detected project roots without crossing risky boundaries."
            .to_string(),
        rule_set: RuleSetDto {
            rule_set_id: "project_safe_rules".to_string(),
            name: "Project safe".to_string(),
            rules: vec![
                category_rule(
                    "documents_review",
                    "Loose documents",
                    80,
                    FileCategory::Document,
                    "Documents/{file_year}",
                    "Route loose documents conservatively.",
                ),
                category_rule(
                    "images_review",
                    "Loose images",
                    70,
                    FileCategory::Image,
                    "Images/{file_year}/{file_month}",
                    "Route loose images conservatively.",
                ),
                RuleDto {
                    rule_id: "unknown_review".to_string(),
                    name: "Unknown files".to_string(),
                    priority: 60,
                    conditions: vec![RuleConditionDto::AnyOf {
                        conditions: vec![
                            RuleConditionDto::NoExtension,
                            RuleConditionDto::FileCategory {
                                category: FileCategory::Unknown,
                            },
                        ],
                    }],
                    action_kind: PlannedActionKind::Review,
                    destination_template: None,
                    explanation: "Unknown files near protected roots stay in review.".to_string(),
                },
            ],
        },
        plan_options: PlanOptionsDto {
            checksum_mode: ChecksumMode::Off,
            duplicate_policy: DuplicatePolicy::Informational,
            review_mode: ReviewMode::Strict,
            project_safety_mode: ProjectSafetyMode::Strict,
            fallback_behavior: FallbackBehavior::Skip,
        },
    }
}

fn downloads_cleanup_preset() -> PresetDefinitionDto {
    PresetDefinitionDto {
        preset_id: "downloads_cleanup".to_string(),
        name: "Downloads Cleanup".to_string(),
        description:
            "Sort mixed download folders by type while leaving risky leftovers in review. Best for disposable inboxes, not project roots."
                .to_string(),
        rule_set: RuleSetDto {
            rule_set_id: "downloads_cleanup_rules".to_string(),
            name: "Downloads cleanup".to_string(),
            rules: vec![
                extension_move_rule(
                    "installers",
                    "Installers",
                    110,
                    &["app", "pkg", "dmg", "msi", "exe"],
                    "Installers",
                    "Route installer packages into Installers.",
                ),
                category_rule(
                    "downloads_archives",
                    "Archives",
                    100,
                    FileCategory::Archive,
                    "Archives",
                    "Route compressed downloads into Archives.",
                ),
                category_rule(
                    "downloads_documents",
                    "Documents",
                    90,
                    FileCategory::Document,
                    "Documents/{file_year}",
                    "Route downloaded documents into yearly folders.",
                ),
                category_rule(
                    "downloads_images",
                    "Images",
                    80,
                    FileCategory::Image,
                    "Images/{file_year}/{file_month}",
                    "Route downloaded images into dated folders.",
                ),
                category_rule(
                    "downloads_videos",
                    "Videos",
                    70,
                    FileCategory::Video,
                    "Videos/{file_year}/{file_month}",
                    "Route downloaded videos into dated folders.",
                ),
                category_rule(
                    "downloads_audio",
                    "Audio",
                    60,
                    FileCategory::Audio,
                    "Audio",
                    "Route downloaded audio into Audio.",
                ),
                review_rule(
                    "downloads_review_leftovers",
                    "Review leftovers",
                    40,
                    any_of(vec![
                        RuleConditionDto::FileCategory {
                            category: FileCategory::Code,
                        },
                        RuleConditionDto::FileCategory {
                            category: FileCategory::Unknown,
                        },
                        RuleConditionDto::NoExtension,
                    ]),
                    "Leave risky leftovers in review instead of moving them automatically.",
                ),
            ],
        },
        plan_options: PlanOptionsDto {
            checksum_mode: ChecksumMode::Off,
            duplicate_policy: DuplicatePolicy::FlagOnly,
            review_mode: ReviewMode::Strict,
            project_safety_mode: ProjectSafetyMode::On,
            fallback_behavior: FallbackBehavior::Skip,
        },
    }
}

fn screenshots_preset() -> PresetDefinitionDto {
    PresetDefinitionDto {
        preset_id: "screenshots_cleanup".to_string(),
        name: "Screenshots Cleanup".to_string(),
        description:
            "Gather screenshot-style image files into dated screenshot folders. Best for screenshot-heavy inboxes, not full photo libraries."
                .to_string(),
        rule_set: RuleSetDto {
            rule_set_id: "screenshots_cleanup_rules".to_string(),
            name: "Screenshots cleanup".to_string(),
            rules: vec![RuleDto {
                rule_id: "screenshots".to_string(),
                name: "Screenshot images".to_string(),
                priority: 100,
                conditions: vec![all_of(vec![
                    RuleConditionDto::FileCategory {
                        category: FileCategory::Image,
                    },
                    any_of(vec![
                        RuleConditionDto::FilenameContains {
                            value: "screenshot".to_string(),
                        },
                        RuleConditionDto::FilenameContains {
                            value: "screen shot".to_string(),
                        },
                        RuleConditionDto::FilenameContains {
                            value: "screen_shot".to_string(),
                        },
                        RuleConditionDto::FilenameContains {
                            value: "screencapture".to_string(),
                        },
                        RuleConditionDto::FilenameContains {
                            value: "snip".to_string(),
                        },
                    ]),
                ])],
                action_kind: PlannedActionKind::Move,
                destination_template: Some("Screenshots/{file_year}/{file_month}".to_string()),
                explanation: "Gather screenshot-style image files into dated folders.".to_string(),
            }],
        },
        plan_options: PlanOptionsDto {
            checksum_mode: ChecksumMode::Off,
            duplicate_policy: DuplicatePolicy::Informational,
            review_mode: ReviewMode::Standard,
            project_safety_mode: ProjectSafetyMode::On,
            fallback_behavior: FallbackBehavior::Skip,
        },
    }
}

fn camera_import_preset() -> PresetDefinitionDto {
    PresetDefinitionDto {
        preset_id: "camera_import".to_string(),
        name: "Camera Import".to_string(),
        description:
            "Sort photo and video imports into dated folders using filesystem timestamps. Best when modified times roughly match capture order; not EXIF-accurate yet."
                .to_string(),
        rule_set: RuleSetDto {
            rule_set_id: "camera_import_rules".to_string(),
            name: "Camera import".to_string(),
            rules: vec![
                extension_move_rule(
                    "raw_images",
                    "RAW photos",
                    110,
                    &["dng", "arw", "cr2", "cr3", "nef", "orf", "raf", "rw2"],
                    "Photos/{file_year}/{file_month}/RAW",
                    "Route common RAW photo formats into dated RAW folders.",
                ),
                category_rule(
                    "camera_images",
                    "Photos",
                    100,
                    FileCategory::Image,
                    "Photos/{file_year}/{file_month}",
                    "Route photo imports into dated folders.",
                ),
                category_rule(
                    "camera_videos",
                    "Videos",
                    90,
                    FileCategory::Video,
                    "Videos/{file_year}/{file_month}",
                    "Route video imports into dated folders.",
                ),
                review_rule(
                    "camera_unknown_review",
                    "Review unknown leftovers",
                    40,
                    any_of(vec![
                        RuleConditionDto::FileCategory {
                            category: FileCategory::Unknown,
                        },
                        RuleConditionDto::NoExtension,
                    ]),
                    "Leave unknown leftovers in review before moving them out of an import batch.",
                ),
            ],
        },
        plan_options: PlanOptionsDto {
            checksum_mode: ChecksumMode::Off,
            duplicate_policy: DuplicatePolicy::FlagOnly,
            review_mode: ReviewMode::Standard,
            project_safety_mode: ProjectSafetyMode::On,
            fallback_behavior: FallbackBehavior::Skip,
        },
    }
}

fn duplicate_review_preset() -> PresetDefinitionDto {
    PresetDefinitionDto {
        preset_id: "duplicate_review".to_string(),
        name: "Duplicate Review".to_string(),
        description: "Build duplicate-focused review items without proposing reorganization moves."
            .to_string(),
        rule_set: RuleSetDto {
            rule_set_id: "duplicate_review_rules".to_string(),
            name: "Duplicate review".to_string(),
            rules: vec![RuleDto {
                rule_id: "duplicate_groups".to_string(),
                name: "Duplicate groups".to_string(),
                priority: 100,
                conditions: vec![RuleConditionDto::DuplicateGroup],
                action_kind: PlannedActionKind::Review,
                destination_template: None,
                explanation: "Duplicate groups require review and keeper selection.".to_string(),
            }],
        },
        plan_options: PlanOptionsDto {
            checksum_mode: ChecksumMode::On,
            duplicate_policy: DuplicatePolicy::FullReview,
            review_mode: ReviewMode::DuplicateFirst,
            project_safety_mode: ProjectSafetyMode::On,
            fallback_behavior: FallbackBehavior::Skip,
        },
    }
}

fn category_rule(
    rule_id: &str,
    name: &str,
    priority: i32,
    category: FileCategory,
    destination_template: &str,
    explanation: &str,
) -> RuleDto {
    RuleDto {
        rule_id: rule_id.to_string(),
        name: name.to_string(),
        priority,
        conditions: vec![RuleConditionDto::FileCategory { category }],
        action_kind: PlannedActionKind::Move,
        destination_template: Some(destination_template.to_string()),
        explanation: explanation.to_string(),
    }
}

fn extension_move_rule(
    rule_id: &str,
    name: &str,
    priority: i32,
    extensions: &[&str],
    destination_template: &str,
    explanation: &str,
) -> RuleDto {
    RuleDto {
        rule_id: rule_id.to_string(),
        name: name.to_string(),
        priority,
        conditions: vec![RuleConditionDto::ExtensionIn {
            extensions: extensions.iter().map(|value| value.to_string()).collect(),
        }],
        action_kind: PlannedActionKind::Move,
        destination_template: Some(destination_template.to_string()),
        explanation: explanation.to_string(),
    }
}

fn review_rule(
    rule_id: &str,
    name: &str,
    priority: i32,
    condition: RuleConditionDto,
    explanation: &str,
) -> RuleDto {
    RuleDto {
        rule_id: rule_id.to_string(),
        name: name.to_string(),
        priority,
        conditions: vec![condition],
        action_kind: PlannedActionKind::Review,
        destination_template: None,
        explanation: explanation.to_string(),
    }
}

fn any_of(conditions: Vec<RuleConditionDto>) -> RuleConditionDto {
    RuleConditionDto::AnyOf { conditions }
}

fn all_of(conditions: Vec<RuleConditionDto>) -> RuleConditionDto {
    RuleConditionDto::AllOf { conditions }
}
