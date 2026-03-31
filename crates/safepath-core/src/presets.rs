use crate::types::{
    ChecksumMode, DuplicatePolicy, FallbackBehavior, FileCategory, PlanOptionsDto,
    PlannedActionKind, PresetDefinitionDto, ProjectSafetyMode, ReviewMode, RuleConditionDto,
    RuleDto, RuleSetDto,
};

pub fn built_in_presets() -> Vec<PresetDefinitionDto> {
    vec![
        general_organize_preset(),
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
