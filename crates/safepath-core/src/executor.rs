use std::fs;
use std::io::{BufReader, Read};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

#[cfg(unix)]
use std::os::unix::fs::MetadataExt;

use uuid::Uuid;

use crate::pathing::{disambiguated_filename, join_segments};
use crate::types::{
    ActionRecordDto, ActionRecordStatus, ChecksumMode, ExecutionOperationKind, ExecutionSessionDto,
    ExecutionSessionStatus, ExecutionStrategy, PlanDto, PlannedActionDto, PlannedActionKind,
    PreflightIssueDto, PreflightIssueSeverity, ProtectionState, ReviewState, SafetyFlag,
};

pub fn preflight_plan(plan: &PlanDto) -> Vec<PreflightIssueDto> {
    let approved_actions = approved_action_indices(plan);
    let mut issues = Vec::new();

    if approved_actions.is_empty() {
        issues.push(PreflightIssueDto {
            action_id: None,
            severity: PreflightIssueSeverity::Blocking,
            message: "Approve at least one executable action before running execution.".to_string(),
        });
    }

    for group in &plan.duplicate_groups {
        if group.item_count < 2 {
            continue;
        }
        if group.selected_keeper_entry_id.is_some() {
            continue;
        }
        let has_approved = group.member_action_ids.iter().any(|action_id| {
            plan.actions
                .iter()
                .find(|action| &action.action_id == action_id)
                .is_some_and(|action| action.review_state == ReviewState::Approved)
        });
        if has_approved {
            issues.push(PreflightIssueDto {
                action_id: None,
                severity: PreflightIssueSeverity::Blocking,
                message: format!(
                    "Duplicate group `{}` has approved actions but no keeper is selected. Choose a keeper before executing.",
                    group.group_id
                ),
            });
        }
    }

    for index in approved_actions {
        let action = &plan.actions[index];
        match strategy_for_action(plan, action) {
            Ok(strategy) => {
                issues.extend(preflight_for_strategy(plan, action, strategy));
            }
            Err(message) => issues.push(PreflightIssueDto {
                action_id: Some(action.action_id.clone()),
                severity: PreflightIssueSeverity::Blocking,
                message,
            }),
        }
    }

    issues.extend(preflight_approved_sources_exist(plan));
    issues.extend(preflight_duplicate_keeper_consistency(plan));

    issues
}

fn action_considered_protected(action: &PlannedActionDto) -> bool {
    if let Some(state) = action.explanation.protection_state {
        if state != ProtectionState::Unprotected {
            return true;
        }
    }
    action
        .explanation
        .safety_flags
        .iter()
        .any(|flag| matches!(flag, SafetyFlag::Protected))
}

fn preflight_approved_sources_exist(plan: &PlanDto) -> Vec<PreflightIssueDto> {
    let mut issues = Vec::new();
    for index in approved_action_indices(plan) {
        let action = &plan.actions[index];
        if fs::metadata(&action.source_path).is_err() {
            issues.push(PreflightIssueDto {
                action_id: Some(action.action_id.clone()),
                severity: PreflightIssueSeverity::Blocking,
                message: format!(
                    "Approved source path `{}` is missing on disk. Rebuild the plan or change approvals.",
                    action.source_path
                ),
            });
        }
    }
    issues
}

fn preflight_duplicate_keeper_consistency(plan: &PlanDto) -> Vec<PreflightIssueDto> {
    let mut issues = Vec::new();
    for group in &plan.duplicate_groups {
        if let Some(keeper_id) = &group.selected_keeper_entry_id {
            if !group.member_entry_ids.contains(keeper_id) {
                issues.push(PreflightIssueDto {
                    action_id: None,
                    severity: PreflightIssueSeverity::Blocking,
                    message: format!(
                        "Duplicate group `{}` lists a keeper that is not part of the group. Pick a valid keeper.",
                        group.group_id
                    ),
                });
            }
        }

        let Some(keeper_id) = &group.selected_keeper_entry_id else {
            continue;
        };

        let keeper_protected = group
            .member_action_ids
            .iter()
            .find_map(|action_id| {
                plan.actions.iter().find(|action| {
                    &action.action_id == action_id && &action.source_entry_id == keeper_id
                })
            })
            .map(action_considered_protected)
            .unwrap_or(false);

        let protected_approved_other = group.member_action_ids.iter().any(|action_id| {
            plan.actions.iter().any(|action| {
                &action.action_id == action_id
                    && &action.source_entry_id != keeper_id
                    && action.review_state == ReviewState::Approved
                    && action_considered_protected(action)
            })
        });

        if protected_approved_other && !keeper_protected {
            issues.push(PreflightIssueDto {
                action_id: None,
                severity: PreflightIssueSeverity::Warning,
                message: format!(
                    "Duplicate group `{}`: the keeper is not a protected copy, but another approved member is. Consider switching the keeper.",
                    group.group_id
                ),
            });
        }
    }
    issues
}

pub fn initialize_execution_session(plan: &PlanDto) -> ExecutionSessionDto {
    let preflight_issues = preflight_plan(plan);
    let has_errors = preflight_issues
        .iter()
        .any(|issue| issue.severity == PreflightIssueSeverity::Blocking);
    let approved_action_count = approved_action_indices(plan).len() as u32;
    let started_at_epoch_ms = now_epoch_ms();

    ExecutionSessionDto {
        session_id: Uuid::new_v4().to_string(),
        plan_id: plan.plan_id.clone(),
        operation_kind: ExecutionOperationKind::Execute,
        related_session_id: None,
        status: if has_errors {
            ExecutionSessionStatus::Failed
        } else {
            ExecutionSessionStatus::Running
        },
        started_at_epoch_ms,
        finished_at_epoch_ms: if has_errors {
            Some(started_at_epoch_ms)
        } else {
            None
        },
        approved_action_count,
        completed_action_count: 0,
        failed_action_count: 0,
        skipped_action_count: 0,
        preflight_issues,
        records: Vec::new(),
        config_fingerprint: plan.config_fingerprint.clone(),
    }
}

pub fn execute_plan(plan: &mut PlanDto) -> ExecutionSessionDto {
    let mut session = initialize_execution_session(plan);
    if session.status == ExecutionSessionStatus::Failed {
        return session;
    }

    for action_id in approved_action_ids(plan) {
        let _ = execute_action_by_id(plan, &action_id, &mut session);
    }

    finalize_execution_session(&mut session);
    session
}

pub fn approved_action_ids(plan: &PlanDto) -> Vec<String> {
    approved_action_indices(plan)
        .into_iter()
        .map(|index| plan.actions[index].action_id.clone())
        .collect()
}

pub fn progress_message(record: &ActionRecordDto) -> Option<String> {
    Some(
        record
            .message
            .clone()
            .unwrap_or_else(|| format!("{:?}: {}", record.strategy, record.source_path)),
    )
}

pub fn execute_action_by_id(
    plan: &mut PlanDto,
    action_id: &str,
    session: &mut ExecutionSessionDto,
) -> Result<ActionRecordDto, String> {
    let Some(index) = plan
        .actions
        .iter()
        .position(|action| action.action_id == action_id)
    else {
        return Err(format!("Action `{action_id}` was not found in the plan."));
    };

    let record = execute_action(plan, index, &session.session_id);
    match record.status {
        ActionRecordStatus::Completed => session.completed_action_count += 1,
        ActionRecordStatus::Failed => session.failed_action_count += 1,
        ActionRecordStatus::Skipped => session.skipped_action_count += 1,
    }
    session.records.push(record.clone());
    Ok(record)
}

pub fn finalize_execution_session(session: &mut ExecutionSessionDto) {
    if session.finished_at_epoch_ms.is_some() {
        return;
    }

    session.finished_at_epoch_ms = Some(now_epoch_ms());
    session.status = if session.failed_action_count == 0 {
        ExecutionSessionStatus::Completed
    } else if session.completed_action_count > 0 || session.skipped_action_count > 0 {
        ExecutionSessionStatus::PartiallyFailed
    } else {
        ExecutionSessionStatus::Failed
    };
}

fn approved_action_indices(plan: &PlanDto) -> Vec<usize> {
    let mut indices = plan
        .actions
        .iter()
        .enumerate()
        .filter(|(_, action)| action.review_state == ReviewState::Approved)
        .map(|(index, _)| index)
        .collect::<Vec<_>>();
    indices.sort_by(|left, right| {
        let left_action = &plan.actions[*left];
        let right_action = &plan.actions[*right];
        left_action
            .destination_path
            .as_deref()
            .unwrap_or(&left_action.source_path)
            .cmp(
                right_action
                    .destination_path
                    .as_deref()
                    .unwrap_or(&right_action.source_path),
            )
            .then_with(|| left_action.source_path.cmp(&right_action.source_path))
    });
    indices
}

fn preflight_for_strategy(
    plan: &PlanDto,
    action: &PlannedActionDto,
    strategy: ExecutionStrategy,
) -> Vec<PreflightIssueDto> {
    let mut issues = Vec::new();

    if !Path::new(&action.source_path).exists() {
        issues.push(error_issue(
            &action.action_id,
            format!("Source path `{}` no longer exists.", action.source_path),
        ));
        return issues;
    }

    match strategy {
        ExecutionStrategy::SameVolumeMove
        | ExecutionStrategy::CrossVolumeSafeMove
        | ExecutionStrategy::CopyOnly => {
            let Some(destination_path) = &action.destination_path else {
                issues.push(error_issue(
                    &action.action_id,
                    "Execution strategy is missing a destination path.".to_string(),
                ));
                return issues;
            };

            if Path::new(destination_path).exists() {
                issues.push(error_issue(
                    &action.action_id,
                    format!("Destination path `{destination_path}` already exists."),
                ));
            }
        }
        ExecutionStrategy::DuplicateConsolidate | ExecutionStrategy::DeleteToTrash => {
            let Some(group_id) = &action.duplicate_group_id else {
                issues.push(error_issue(
                    &action.action_id,
                    "Duplicate execution action is missing a duplicate group id.".to_string(),
                ));
                return issues;
            };

            let Some(group) = plan
                .duplicate_groups
                .iter()
                .find(|group| &group.group_id == group_id)
            else {
                issues.push(error_issue(
                    &action.action_id,
                    format!("Duplicate group `{group_id}` is missing from the plan."),
                ));
                return issues;
            };

            if group.selected_keeper_entry_id.is_none() {
                issues.push(error_issue(
                    &action.action_id,
                    "Choose a duplicate keeper before executing duplicate cleanup.".to_string(),
                ));
            }
        }
    }

    issues
}

fn strategy_for_action(
    plan: &PlanDto,
    action: &PlannedActionDto,
) -> Result<ExecutionStrategy, String> {
    if action.duplicate_group_id.is_some() {
        if plan.preset_id == "duplicate_review" {
            return Ok(ExecutionStrategy::DeleteToTrash);
        }
        return Ok(ExecutionStrategy::DuplicateConsolidate);
    }

    match action.action_kind {
        PlannedActionKind::Move => {
            let destination_path = action.destination_path.as_ref().ok_or_else(|| {
                format!(
                    "Move action `{}` is missing a destination path.",
                    action.action_id
                )
            })?;
            determine_move_strategy(&action.source_path, destination_path)
        }
        PlannedActionKind::Review => action
            .destination_path
            .as_ref()
            .map(|_| ExecutionStrategy::CopyOnly)
            .ok_or_else(|| {
                format!(
                    "Review action `{}` needs a destination path before it can execute as a copy.",
                    action.action_id
                )
            }),
        PlannedActionKind::Skip => Err(format!(
            "Skipped action `{}` cannot be executed.",
            action.action_id
        )),
    }
}

fn determine_move_strategy(
    source_path: &str,
    destination_path: &str,
) -> Result<ExecutionStrategy, String> {
    if same_volume(source_path, destination_path)? {
        Ok(ExecutionStrategy::SameVolumeMove)
    } else {
        Ok(ExecutionStrategy::CrossVolumeSafeMove)
    }
}

pub(crate) fn same_volume(source_path: &str, destination_path: &str) -> Result<bool, String> {
    let source_metadata = fs::metadata(source_path)
        .map_err(|error| format!("Cannot read source metadata: {error}"))?;
    let destination_anchor =
        nearest_existing_ancestor(Path::new(destination_path)).ok_or_else(|| {
            format!("No existing destination ancestor found for `{destination_path}`.")
        })?;
    let destination_metadata = fs::metadata(&destination_anchor)
        .map_err(|error| format!("Cannot read destination metadata: {error}"))?;

    #[cfg(unix)]
    {
        return Ok(source_metadata.dev() == destination_metadata.dev());
    }

    #[cfg(not(unix))]
    {
        let _ = (source_metadata, destination_metadata);
        #[cfg(windows)]
        {
            return Ok(windows_volume_key(Path::new(source_path))
                == windows_volume_key(destination_anchor.as_path()));
        }

        #[cfg(not(windows))]
        {
            Ok(false)
        }
    }
}

#[cfg(windows)]
fn windows_volume_key(path: &Path) -> Option<String> {
    use std::path::Component;

    path.components().find_map(|component| match component {
        Component::Prefix(prefix) => {
            Some(prefix.as_os_str().to_string_lossy().to_ascii_lowercase())
        }
        _ => None,
    })
}

fn nearest_existing_ancestor(path: &Path) -> Option<PathBuf> {
    let mut current = path.to_path_buf();
    while !current.exists() {
        current = current.parent()?.to_path_buf();
    }
    Some(current)
}

fn execute_action(plan: &mut PlanDto, index: usize, session_id: &str) -> ActionRecordDto {
    let action = plan.actions[index].clone();
    let started_at_epoch_ms = now_epoch_ms();
    let outcome = match strategy_for_action(plan, &action) {
        Ok(strategy) => execute_strategy(plan, &action, strategy, session_id),
        Err(message) => ExecutionOutcome::failed(ExecutionStrategy::CopyOnly, message),
    };
    let finished_at_epoch_ms = now_epoch_ms();

    if matches!(
        outcome.status,
        ActionRecordStatus::Completed | ActionRecordStatus::Skipped
    ) {
        plan.actions[index].review_state = ReviewState::Executed;
    }

    ActionRecordDto {
        record_id: Uuid::new_v4().to_string(),
        session_id: session_id.to_string(),
        operation_kind: ExecutionOperationKind::Execute,
        related_record_id: None,
        action_id: action.action_id,
        source_path: action.source_path,
        destination_path: outcome.destination_path,
        strategy: outcome.strategy,
        status: outcome.status,
        message: outcome.message,
        rollback_safe: outcome.rollback_safe,
        started_at_epoch_ms,
        finished_at_epoch_ms,
    }
}

fn execute_strategy(
    plan: &PlanDto,
    action: &PlannedActionDto,
    strategy: ExecutionStrategy,
    session_id: &str,
) -> ExecutionOutcome {
    match strategy {
        ExecutionStrategy::SameVolumeMove => execute_same_volume_move(plan, action),
        ExecutionStrategy::CrossVolumeSafeMove => execute_cross_volume_move(action),
        ExecutionStrategy::CopyOnly => execute_copy_only(action),
        ExecutionStrategy::DuplicateConsolidate => {
            execute_duplicate_consolidate(plan, action, session_id)
        }
        ExecutionStrategy::DeleteToTrash => execute_delete_to_trash(plan, action, session_id),
    }
}

fn execute_same_volume_move(plan: &PlanDto, action: &PlannedActionDto) -> ExecutionOutcome {
    let Some(destination_path) = &action.destination_path else {
        return ExecutionOutcome::failed(
            ExecutionStrategy::SameVolumeMove,
            "Missing destination path for same-volume move.".to_string(),
        );
    };
    let checksum_before_move = if checksum_mode_enabled(plan) {
        match hash_path(Path::new(&action.source_path)) {
            Ok(hash) => Some(hash),
            Err(error) => {
                return ExecutionOutcome::failed(ExecutionStrategy::SameVolumeMove, error)
            }
        }
    } else {
        None
    };

    if let Err(error) = create_parent_dirs(destination_path) {
        return ExecutionOutcome::failed(ExecutionStrategy::SameVolumeMove, error);
    }
    if let Err(error) = fs::rename(&action.source_path, destination_path) {
        return ExecutionOutcome::failed(
            ExecutionStrategy::SameVolumeMove,
            format!("Rename failed: {error}"),
        );
    }
    if !Path::new(destination_path).exists() {
        return ExecutionOutcome::failed(
            ExecutionStrategy::SameVolumeMove,
            "Destination was missing after rename.".to_string(),
        );
    }

    if let Some(expected_hash) = checksum_before_move {
        if let Err(message) = verify_same_volume_relocation(
            &action.source_path,
            destination_path,
            expected_hash,
            "same-volume move",
        ) {
            return ExecutionOutcome::failed(ExecutionStrategy::SameVolumeMove, message);
        }
    }

    ExecutionOutcome::completed(
        ExecutionStrategy::SameVolumeMove,
        Some(destination_path.clone()),
        Some(if checksum_mode_enabled(plan) {
            "Moved on the same volume, verified destination exists, and re-verified checksum."
                .to_string()
        } else {
            "Moved on the same volume and verified destination exists.".to_string()
        }),
        true,
    )
}

fn execute_cross_volume_move(action: &PlannedActionDto) -> ExecutionOutcome {
    let Some(destination_path) = &action.destination_path else {
        return ExecutionOutcome::failed(
            ExecutionStrategy::CrossVolumeSafeMove,
            "Missing destination path for cross-volume move.".to_string(),
        );
    };

    if let Err(error) = create_parent_dirs(destination_path) {
        return ExecutionOutcome::failed(ExecutionStrategy::CrossVolumeSafeMove, error);
    }

    let temp_destination = format!("{destination_path}.safepath-tmp-{}", Uuid::new_v4());
    if let Err(error) = copy_path(&action.source_path, &temp_destination) {
        return ExecutionOutcome::failed(
            ExecutionStrategy::CrossVolumeSafeMove,
            format!("Copy to temporary destination failed: {error}"),
        );
    }

    match verify_same_content(&action.source_path, &temp_destination) {
        Ok(true) => {}
        Ok(false) => {
            let _ = remove_path(&temp_destination);
            return ExecutionOutcome::failed(
                ExecutionStrategy::CrossVolumeSafeMove,
                "Checksum verification failed for copied temporary file.".to_string(),
            );
        }
        Err(error) => {
            let _ = remove_path(&temp_destination);
            return ExecutionOutcome::failed(ExecutionStrategy::CrossVolumeSafeMove, error);
        }
    }

    if let Err(error) = fs::rename(&temp_destination, destination_path) {
        let _ = remove_path(&temp_destination);
        return ExecutionOutcome::failed(
            ExecutionStrategy::CrossVolumeSafeMove,
            format!("Final rename into destination failed: {error}"),
        );
    }
    if let Err(error) = remove_path(&action.source_path) {
        return ExecutionOutcome::failed(
            ExecutionStrategy::CrossVolumeSafeMove,
            format!("Failed to remove source after verified copy: {error}"),
        );
    }
    if !Path::new(destination_path).exists() {
        return ExecutionOutcome::failed(
            ExecutionStrategy::CrossVolumeSafeMove,
            "Destination was missing after verified move.".to_string(),
        );
    }

    ExecutionOutcome::completed(
        ExecutionStrategy::CrossVolumeSafeMove,
        Some(destination_path.clone()),
        Some(
            "Copied via a temporary destination, verified checksum, and removed the source."
                .to_string(),
        ),
        true,
    )
}

fn execute_copy_only(action: &PlannedActionDto) -> ExecutionOutcome {
    let Some(destination_path) = &action.destination_path else {
        return ExecutionOutcome::failed(
            ExecutionStrategy::CopyOnly,
            "Missing destination path for copy-only execution.".to_string(),
        );
    };

    if let Err(error) = create_parent_dirs(destination_path) {
        return ExecutionOutcome::failed(ExecutionStrategy::CopyOnly, error);
    }

    let temp_destination = format!("{destination_path}.safepath-tmp-{}", Uuid::new_v4());
    if let Err(error) = copy_path(&action.source_path, &temp_destination) {
        return ExecutionOutcome::failed(
            ExecutionStrategy::CopyOnly,
            format!("Copy to temporary destination failed: {error}"),
        );
    }

    match verify_same_content(&action.source_path, &temp_destination) {
        Ok(true) => {}
        Ok(false) => {
            let _ = remove_path(&temp_destination);
            return ExecutionOutcome::failed(
                ExecutionStrategy::CopyOnly,
                "Checksum verification failed for copied file.".to_string(),
            );
        }
        Err(error) => {
            let _ = remove_path(&temp_destination);
            return ExecutionOutcome::failed(ExecutionStrategy::CopyOnly, error);
        }
    }

    if let Err(error) = fs::rename(&temp_destination, destination_path) {
        let _ = remove_path(&temp_destination);
        return ExecutionOutcome::failed(
            ExecutionStrategy::CopyOnly,
            format!("Failed to finalize copied destination: {error}"),
        );
    }

    ExecutionOutcome::completed(
        ExecutionStrategy::CopyOnly,
        Some(destination_path.clone()),
        Some("Copied into place, verified content, and left the source untouched.".to_string()),
        true,
    )
}

fn execute_duplicate_consolidate(
    plan: &PlanDto,
    action: &PlannedActionDto,
    session_id: &str,
) -> ExecutionOutcome {
    let Some(group_id) = &action.duplicate_group_id else {
        return ExecutionOutcome::failed(
            ExecutionStrategy::DuplicateConsolidate,
            "Missing duplicate group id for duplicate consolidation.".to_string(),
        );
    };
    let Some(group) = plan
        .duplicate_groups
        .iter()
        .find(|group| &group.group_id == group_id)
    else {
        return ExecutionOutcome::failed(
            ExecutionStrategy::DuplicateConsolidate,
            format!("Duplicate group `{group_id}` was not found in the plan."),
        );
    };
    let Some(keeper_entry_id) = &group.selected_keeper_entry_id else {
        return ExecutionOutcome::failed(
            ExecutionStrategy::DuplicateConsolidate,
            "Duplicate keeper must be selected before consolidation.".to_string(),
        );
    };

    if &action.source_entry_id == keeper_entry_id {
        return ExecutionOutcome {
            strategy: ExecutionStrategy::DuplicateConsolidate,
            status: ActionRecordStatus::Skipped,
            destination_path: None,
            message: Some("Selected keeper stays in place.".to_string()),
            rollback_safe: false,
        };
    }

    let holding_destination = group_destination(
        plan,
        session_id,
        group_id,
        &action.source_path,
        &action.source_entry_id,
        ".safepath-duplicates",
    );
    if let Err(error) = create_parent_dirs(&holding_destination) {
        return ExecutionOutcome::failed(ExecutionStrategy::DuplicateConsolidate, error);
    }

    match relocate_source_path(
        &action.source_path,
        &holding_destination,
        ExecutionStrategy::DuplicateConsolidate,
        "Moved non-keeper duplicate into safe holding.",
        "Failed to move duplicate into safe holding",
        checksum_mode_enabled(plan),
    ) {
        Ok(outcome) => outcome,
        Err(outcome) => return outcome,
    }
}

fn execute_delete_to_trash(
    plan: &PlanDto,
    action: &PlannedActionDto,
    session_id: &str,
) -> ExecutionOutcome {
    let Some(group_id) = &action.duplicate_group_id else {
        return ExecutionOutcome::failed(
            ExecutionStrategy::DeleteToTrash,
            "Missing duplicate group id for Safepath trash-hold execution.".to_string(),
        );
    };
    let Some(group) = plan
        .duplicate_groups
        .iter()
        .find(|group| &group.group_id == group_id)
    else {
        return ExecutionOutcome::failed(
            ExecutionStrategy::DeleteToTrash,
            format!("Duplicate group `{group_id}` was not found in the plan."),
        );
    };
    let Some(keeper_entry_id) = &group.selected_keeper_entry_id else {
        return ExecutionOutcome::failed(
            ExecutionStrategy::DeleteToTrash,
            "Duplicate keeper must be selected before moving a duplicate into Safepath trash holding."
                .to_string(),
        );
    };

    if &action.source_entry_id == keeper_entry_id {
        return ExecutionOutcome {
            strategy: ExecutionStrategy::DeleteToTrash,
            status: ActionRecordStatus::Skipped,
            destination_path: None,
            message: Some("Selected keeper stays in place.".to_string()),
            rollback_safe: false,
        };
    }

    let trash_destination = group_destination(
        plan,
        session_id,
        group_id,
        &action.source_path,
        &action.source_entry_id,
        ".safepath-trash",
    );
    if let Err(error) = create_parent_dirs(&trash_destination) {
        return ExecutionOutcome::failed(ExecutionStrategy::DeleteToTrash, error);
    }

    match relocate_source_path(
        &action.source_path,
        &trash_destination,
        ExecutionStrategy::DeleteToTrash,
        "Moved non-keeper duplicate into the Safepath trash holding area.",
        "Failed to move duplicate into Safepath trash holding",
        checksum_mode_enabled(plan),
    ) {
        Ok(outcome) => outcome,
        Err(outcome) => outcome,
    }
}

fn group_destination(
    plan: &PlanDto,
    session_id: &str,
    group_id: &str,
    source_path: &str,
    source_entry_id: &str,
    folder_name: &str,
) -> String {
    let filename = disambiguated_filename(source_path, source_entry_id);
    join_segments(
        &plan.destination_root,
        &[folder_name, session_id, group_id, filename.as_str()],
    )
}

fn relocate_source_path(
    source_path: &str,
    destination_path: &str,
    strategy: ExecutionStrategy,
    success_message: &str,
    failure_context: &str,
    verify_same_volume_checksum: bool,
) -> Result<ExecutionOutcome, ExecutionOutcome> {
    match same_volume(source_path, destination_path) {
        Ok(true) => {
            let checksum_before_move = if verify_same_volume_checksum {
                Some(
                    hash_path(Path::new(source_path))
                        .map_err(|error| ExecutionOutcome::failed(strategy, error))?,
                )
            } else {
                None
            };
            if let Err(error) = fs::rename(source_path, destination_path) {
                return Err(ExecutionOutcome::failed(
                    strategy,
                    format!("{failure_context}: {error}"),
                ));
            }
            if let Some(expected_hash) = checksum_before_move {
                verify_same_volume_relocation(
                    source_path,
                    destination_path,
                    expected_hash,
                    failure_context,
                )
                .map_err(|message| ExecutionOutcome::failed(strategy, message))?;
            }
        }
        Ok(false) => {
            let temp_destination = format!("{destination_path}.safepath-tmp-{}", Uuid::new_v4());
            if let Err(error) = copy_path(source_path, &temp_destination) {
                return Err(ExecutionOutcome::failed(
                    strategy,
                    format!("{failure_context}: {error}"),
                ));
            }
            match verify_same_content(source_path, &temp_destination) {
                Ok(true) => {}
                Ok(false) => {
                    let _ = remove_path(&temp_destination);
                    return Err(ExecutionOutcome::failed(
                        strategy,
                        "Checksum verification failed after copying into holding.".to_string(),
                    ));
                }
                Err(error) => {
                    let _ = remove_path(&temp_destination);
                    return Err(ExecutionOutcome::failed(strategy, error));
                }
            }
            if let Err(error) = fs::rename(&temp_destination, destination_path) {
                let _ = remove_path(&temp_destination);
                return Err(ExecutionOutcome::failed(
                    strategy,
                    format!("Failed to finalize holding destination: {error}"),
                ));
            }
            if let Err(error) = remove_path(source_path) {
                return Err(ExecutionOutcome::failed(
                    strategy,
                    format!("Failed to remove source after verified relocation: {error}"),
                ));
            }
        }
        Err(error) => return Err(ExecutionOutcome::failed(strategy, error)),
    }

    Ok(ExecutionOutcome::completed(
        strategy,
        Some(destination_path.to_string()),
        Some(if verify_same_volume_checksum {
            format!("{success_message} Re-verified checksum after same-volume relocation.")
        } else {
            success_message.to_string()
        }),
        true,
    ))
}

pub(crate) fn create_parent_dirs(destination_path: &str) -> Result<(), String> {
    let parent = Path::new(destination_path)
        .parent()
        .ok_or_else(|| format!("Destination `{destination_path}` has no parent directory."))?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Failed to create destination directories: {error}"))
}

fn checksum_mode_enabled(plan: &PlanDto) -> bool {
    matches!(plan.plan_options.checksum_mode, ChecksumMode::On)
}

fn verify_same_volume_relocation(
    original_source_path: &str,
    destination_path: &str,
    expected_hash: blake3::Hash,
    context: &str,
) -> Result<(), String> {
    let actual_hash = hash_path(Path::new(destination_path))?;
    if actual_hash == expected_hash {
        return Ok(());
    }

    match fs::rename(destination_path, original_source_path) {
        Ok(()) => Err(format!(
            "Checksum verification failed after {context}; Safepath restored the original path."
        )),
        Err(rollback_error) => Err(format!(
            "Checksum verification failed after {context}, and rollback to the original path failed: {rollback_error}"
        )),
    }
}

pub(crate) fn verify_same_content(left: &str, right: &str) -> Result<bool, String> {
    Ok(hash_path(Path::new(left))? == hash_path(Path::new(right))?)
}

fn hash_path(path: &Path) -> Result<blake3::Hash, String> {
    let mut hasher = blake3::Hasher::new();
    hash_path_into(path, path, &mut hasher)?;
    Ok(hasher.finalize())
}

fn hash_path_into(root: &Path, current: &Path, hasher: &mut blake3::Hasher) -> Result<(), String> {
    let metadata = fs::symlink_metadata(current).map_err(|error| {
        format!(
            "Failed to read metadata for `{}`: {error}",
            current.display()
        )
    })?;
    let relative = current
        .strip_prefix(root)
        .unwrap_or(current)
        .to_string_lossy()
        .into_owned();

    if metadata.file_type().is_symlink() {
        return Err(format!(
            "Symlink execution is not supported yet for `{}`.",
            current.display()
        ));
    }

    if metadata.is_dir() {
        hasher.update(b"dir\0");
        hasher.update(relative.as_bytes());
        let mut children = fs::read_dir(current)
            .map_err(|error| format!("Failed to read directory `{}`: {error}", current.display()))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())?;
        children.sort_by_key(|entry| entry.file_name());
        for child in children {
            hash_path_into(root, &child.path(), hasher)?;
        }
        return Ok(());
    }

    if metadata.is_file() {
        hasher.update(b"file\0");
        hasher.update(relative.as_bytes());
        let file = fs::File::open(current)
            .map_err(|error| format!("Failed to read `{}`: {error}", current.display()))?;
        let mut reader = BufReader::new(file);
        let mut buffer = [0_u8; 1024 * 1024];
        loop {
            let read = reader
                .read(&mut buffer)
                .map_err(|error| format!("Failed to stream `{}`: {error}", current.display()))?;
            if read == 0 {
                break;
            }
            hasher.update(&buffer[..read]);
        }
        return Ok(());
    }

    Err(format!(
        "Unsupported path type encountered during hashing: `{}`.",
        current.display()
    ))
}

pub(crate) fn copy_path(source_path: &str, destination_path: &str) -> Result<(), String> {
    copy_path_inner(Path::new(source_path), Path::new(destination_path))
}

fn copy_path_inner(source: &Path, destination: &Path) -> Result<(), String> {
    let metadata = fs::symlink_metadata(source).map_err(|error| {
        format!(
            "Failed to read metadata for `{}`: {error}",
            source.display()
        )
    })?;
    if metadata.file_type().is_symlink() {
        return Err(format!(
            "Symlink execution is not supported yet for `{}`.",
            source.display()
        ));
    }

    if metadata.is_dir() {
        fs::create_dir_all(destination).map_err(|error| {
            format!(
                "Failed to create directory `{}`: {error}",
                destination.display()
            )
        })?;
        let mut children = fs::read_dir(source)
            .map_err(|error| format!("Failed to read directory `{}`: {error}", source.display()))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())?;
        children.sort_by_key(|entry| entry.file_name());
        for child in children {
            let child_destination = destination.join(child.file_name());
            copy_path_inner(&child.path(), &child_destination)?;
        }
        fs::set_permissions(destination, metadata.permissions()).map_err(|error| {
            format!(
                "Failed to apply permissions to `{}`: {error}",
                destination.display()
            )
        })?;
        return Ok(());
    }

    if metadata.is_file() {
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent).map_err(|error| {
                format!(
                    "Failed to create destination directories `{}`: {error}",
                    parent.display()
                )
            })?;
        }
        fs::copy(source, destination).map_err(|error| {
            format!(
                "Failed to copy `{}` to `{}`: {error}",
                source.display(),
                destination.display()
            )
        })?;
        fs::set_permissions(destination, metadata.permissions()).map_err(|error| {
            format!(
                "Failed to apply permissions to `{}`: {error}",
                destination.display()
            )
        })?;
        return Ok(());
    }

    Err(format!(
        "Unsupported path type encountered during copy: `{}`.",
        source.display()
    ))
}

pub(crate) fn remove_path(path: &str) -> Result<(), String> {
    let path = Path::new(path);
    let metadata = fs::symlink_metadata(path)
        .map_err(|error| format!("Failed to read metadata for `{}`: {error}", path.display()))?;
    if metadata.is_dir() {
        fs::remove_dir_all(path)
            .map_err(|error| format!("Failed to remove directory `{}`: {error}", path.display()))
    } else {
        fs::remove_file(path)
            .map_err(|error| format!("Failed to remove file `{}`: {error}", path.display()))
    }
}

fn error_issue(action_id: &str, message: String) -> PreflightIssueDto {
    PreflightIssueDto {
        action_id: Some(action_id.to_string()),
        severity: PreflightIssueSeverity::Blocking,
        message,
    }
}

fn now_epoch_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

struct ExecutionOutcome {
    strategy: ExecutionStrategy,
    status: ActionRecordStatus,
    destination_path: Option<String>,
    message: Option<String>,
    rollback_safe: bool,
}

impl ExecutionOutcome {
    fn completed(
        strategy: ExecutionStrategy,
        destination_path: Option<String>,
        message: Option<String>,
        rollback_safe: bool,
    ) -> Self {
        Self {
            strategy,
            status: ActionRecordStatus::Completed,
            destination_path,
            message,
            rollback_safe,
        }
    }

    fn failed(strategy: ExecutionStrategy, message: String) -> Self {
        Self {
            strategy,
            status: ActionRecordStatus::Failed,
            destination_path: None,
            message: Some(message),
            rollback_safe: false,
        }
    }
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::{execute_plan, preflight_plan};
    use crate::types::{
        ActionExplanationDto, ActionRecordStatus, ConflictKind, DuplicateCertainty,
        ExecutionSessionStatus, ExecutionStrategy, PlanDto, PlanDuplicateGroupDto, PlanSummaryDto,
        PlannedActionDto, PlannedActionKind, PreflightIssueSeverity, ProtectionState, ReviewState,
        SafetyFlag,
    };
    use uuid::Uuid;

    #[test]
    fn preflight_requires_approved_actions() {
        let plan = sample_plan(Vec::new(), Vec::new());
        let issues = preflight_plan(&plan);
        assert!(issues
            .iter()
            .any(|issue| issue.message.contains("Approve at least one")));
    }

    #[test]
    fn preflight_rejects_duplicate_keeper_not_in_group() {
        let group = PlanDuplicateGroupDto {
            group_id: "g1".to_string(),
            certainty: DuplicateCertainty::Definite,
            representative_name: "dup.txt".to_string(),
            item_count: 2,
            member_action_ids: vec!["action-1".to_string()],
            member_entry_ids: vec!["entry-1".to_string(), "entry-2".to_string()],
            selected_keeper_entry_id: Some("not-a-member".to_string()),
            recommended_keeper_entry_id: None,
            recommended_keeper_reason: None,
            recommended_keeper_confidence: None,
            recommended_keeper_reason_tags: Vec::new(),
            match_basis: None,
            confidence: None,
            evidence: None,
            match_explanation: None,
            stable_group_key: None,
        };
        let plan = sample_plan(vec![sample_move_action("/tmp/a".into(), "/tmp/b".into())], vec![group]);
        let issues = preflight_plan(&plan);
        assert!(issues.iter().any(|issue| issue.message.contains("not part of the group")));
    }

    #[test]
    fn preflight_warns_when_keeper_is_not_protected_but_peer_is() {
        let group = PlanDuplicateGroupDto {
            group_id: "g1".to_string(),
            certainty: DuplicateCertainty::Definite,
            representative_name: "dup.txt".to_string(),
            item_count: 2,
            member_action_ids: vec!["action-1".to_string(), "action-2".to_string()],
            member_entry_ids: vec!["entry-keeper".to_string(), "entry-prot".to_string()],
            selected_keeper_entry_id: Some("entry-keeper".to_string()),
            recommended_keeper_entry_id: None,
            recommended_keeper_reason: None,
            recommended_keeper_confidence: None,
            recommended_keeper_reason_tags: Vec::new(),
            match_basis: None,
            confidence: None,
            evidence: None,
            match_explanation: None,
            stable_group_key: None,
        };
        let mut exp_unprot = sample_explanation();
        exp_unprot.protection_state = Some(ProtectionState::Unprotected);
        let mut exp_prot = sample_explanation();
        exp_prot.protection_state = Some(ProtectionState::UserProtected);
        exp_prot.safety_flags = vec![SafetyFlag::Protected];
        let actions = vec![
            PlannedActionDto {
                action_id: "action-1".to_string(),
                source_entry_id: "entry-keeper".to_string(),
                source_path: "/tmp/k".into(),
                destination_path: Some("/tmp/dk".into()),
                duplicate_group_id: Some("g1".to_string()),
                action_kind: PlannedActionKind::Move,
                review_state: ReviewState::Approved,
                explanation: exp_unprot,
            },
            PlannedActionDto {
                action_id: "action-2".to_string(),
                source_entry_id: "entry-prot".to_string(),
                source_path: "/tmp/p".into(),
                destination_path: Some("/tmp/dp".into()),
                duplicate_group_id: Some("g1".to_string()),
                action_kind: PlannedActionKind::Move,
                review_state: ReviewState::Approved,
                explanation: exp_prot,
            },
        ];
        let plan = sample_plan(actions, vec![group]);
        let issues = preflight_plan(&plan);
        assert!(issues.iter().any(|issue| {
            issue.severity == PreflightIssueSeverity::Warning && issue.message.contains("protected copy")
        }));
    }

    #[test]
    fn same_volume_move_executes_and_marks_action_executed() {
        let temp_dir = std::env::temp_dir().join(format!("safepath-exec-{}", Uuid::new_v4()));
        fs::create_dir_all(&temp_dir).expect("create temp dir");
        let source = temp_dir.join("source.txt");
        let destination = temp_dir.join("dest/source.txt");
        fs::write(&source, b"hello").expect("write source");

        let action = sample_move_action(
            source.to_string_lossy().to_string(),
            destination.to_string_lossy().to_string(),
        );
        let mut plan = sample_plan(vec![action], Vec::new());
        let session = execute_plan(&mut plan);

        assert_eq!(session.status, ExecutionSessionStatus::Completed);
        assert_eq!(
            session.records[0].strategy,
            ExecutionStrategy::SameVolumeMove
        );
        assert!(session.records[0].rollback_safe);
        assert_eq!(plan.actions[0].review_state, ReviewState::Executed);
        assert!(destination.exists());

        let _ = fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn review_action_with_destination_executes_as_copy_only() {
        let temp_dir = std::env::temp_dir().join(format!("safepath-copy-{}", Uuid::new_v4()));
        fs::create_dir_all(&temp_dir).expect("create temp dir");
        let source = temp_dir.join("source.txt");
        let destination = temp_dir.join("copies/source.txt");
        fs::write(&source, b"hello").expect("write source");

        let action = PlannedActionDto {
            action_id: "copy-action".to_string(),
            source_entry_id: "entry-1".to_string(),
            source_path: source.to_string_lossy().to_string(),
            destination_path: Some(destination.to_string_lossy().to_string()),
            duplicate_group_id: None,
            action_kind: PlannedActionKind::Review,
            review_state: ReviewState::Approved,
            explanation: sample_explanation(),
        };
        let mut plan = sample_plan(vec![action], Vec::new());

        let session = execute_plan(&mut plan);

        assert_eq!(session.status, ExecutionSessionStatus::Completed);
        assert_eq!(session.records[0].strategy, ExecutionStrategy::CopyOnly);
        assert!(source.exists());
        assert!(destination.exists());
        assert_eq!(
            fs::read(&source).expect("read source"),
            fs::read(&destination).expect("read destination")
        );

        let _ = fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn duplicate_consolidate_moves_non_keeper_to_safe_holding() {
        let temp_dir = std::env::temp_dir().join(format!("safepath-dup-{}", Uuid::new_v4()));
        fs::create_dir_all(&temp_dir).expect("create temp dir");
        let keeper = temp_dir.join("keeper.txt");
        let duplicate = temp_dir.join("duplicate.txt");
        fs::write(&keeper, b"same").expect("write keeper");
        fs::write(&duplicate, b"same").expect("write duplicate");

        let plan_root = temp_dir.join("organized");
        fs::create_dir_all(&plan_root).expect("create plan root");

        let keeper_action = PlannedActionDto {
            action_id: "keeper-action".to_string(),
            source_entry_id: "keeper-entry".to_string(),
            source_path: keeper.to_string_lossy().to_string(),
            destination_path: None,
            duplicate_group_id: Some("group-1".to_string()),
            action_kind: PlannedActionKind::Review,
            review_state: ReviewState::Approved,
            explanation: sample_explanation(),
        };
        let duplicate_action = PlannedActionDto {
            action_id: "duplicate-action".to_string(),
            source_entry_id: "duplicate-entry".to_string(),
            source_path: duplicate.to_string_lossy().to_string(),
            destination_path: None,
            duplicate_group_id: Some("group-1".to_string()),
            action_kind: PlannedActionKind::Review,
            review_state: ReviewState::Approved,
            explanation: sample_explanation(),
        };

        let duplicate_group = PlanDuplicateGroupDto {
            group_id: "group-1".to_string(),
            certainty: DuplicateCertainty::Definite,
            representative_name: "duplicate".to_string(),
            item_count: 2,
            member_action_ids: vec!["keeper-action".to_string(), "duplicate-action".to_string()],
            member_entry_ids: vec!["keeper-entry".to_string(), "duplicate-entry".to_string()],
            selected_keeper_entry_id: Some("keeper-entry".to_string()),
            recommended_keeper_entry_id: Some("keeper-entry".to_string()),
            recommended_keeper_reason: Some("Newest file".to_string()),
            recommended_keeper_confidence: Some(0.8),
            recommended_keeper_reason_tags: vec!["newest available timestamp".to_string()],
            match_basis: None,
            confidence: None,
            evidence: None,
            match_explanation: None,
            stable_group_key: None,
        };

        let mut plan = sample_plan(vec![keeper_action, duplicate_action], vec![duplicate_group]);
        plan.destination_root = plan_root.to_string_lossy().to_string();

        let session = execute_plan(&mut plan);

        assert_eq!(session.status, ExecutionSessionStatus::Completed);
        assert_eq!(session.records.len(), 2);
        assert!(keeper.exists());
        assert!(!duplicate.exists());
        assert!(session.records.iter().any(|record| {
            record.strategy == ExecutionStrategy::DuplicateConsolidate
                && record.status == ActionRecordStatus::Completed
        }));

        let _ = fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn duplicate_review_preset_moves_non_keeper_into_trash_holding() {
        let temp_dir = std::env::temp_dir().join(format!("safepath-trash-{}", Uuid::new_v4()));
        fs::create_dir_all(&temp_dir).expect("create temp dir");
        let keeper = temp_dir.join("keeper.txt");
        let duplicate = temp_dir.join("duplicate.txt");
        fs::write(&keeper, b"same").expect("write keeper");
        fs::write(&duplicate, b"same").expect("write duplicate");

        let plan_root = temp_dir.join("organized");
        fs::create_dir_all(&plan_root).expect("create plan root");

        let keeper_action = PlannedActionDto {
            action_id: "keeper-action".to_string(),
            source_entry_id: "keeper-entry".to_string(),
            source_path: keeper.to_string_lossy().to_string(),
            destination_path: None,
            duplicate_group_id: Some("group-1".to_string()),
            action_kind: PlannedActionKind::Review,
            review_state: ReviewState::Approved,
            explanation: sample_explanation(),
        };
        let duplicate_action = PlannedActionDto {
            action_id: "duplicate-action".to_string(),
            source_entry_id: "duplicate-entry".to_string(),
            source_path: duplicate.to_string_lossy().to_string(),
            destination_path: None,
            duplicate_group_id: Some("group-1".to_string()),
            action_kind: PlannedActionKind::Review,
            review_state: ReviewState::Approved,
            explanation: sample_explanation(),
        };
        let duplicate_group = PlanDuplicateGroupDto {
            group_id: "group-1".to_string(),
            certainty: DuplicateCertainty::Definite,
            representative_name: "duplicate".to_string(),
            item_count: 2,
            member_action_ids: vec!["keeper-action".to_string(), "duplicate-action".to_string()],
            member_entry_ids: vec!["keeper-entry".to_string(), "duplicate-entry".to_string()],
            selected_keeper_entry_id: Some("keeper-entry".to_string()),
            recommended_keeper_entry_id: Some("keeper-entry".to_string()),
            recommended_keeper_reason: Some("Newest file".to_string()),
            recommended_keeper_confidence: Some(0.8),
            recommended_keeper_reason_tags: vec!["newest available timestamp".to_string()],
            match_basis: None,
            confidence: None,
            evidence: None,
            match_explanation: None,
            stable_group_key: None,
        };

        let mut plan = sample_plan(vec![keeper_action, duplicate_action], vec![duplicate_group]);
        plan.preset_id = "duplicate_review".to_string();
        plan.destination_root = plan_root.to_string_lossy().to_string();

        let session = execute_plan(&mut plan);

        assert_eq!(session.status, ExecutionSessionStatus::Completed);
        assert!(keeper.exists());
        assert!(!duplicate.exists());
        assert!(session.records.iter().any(|record| {
            record.strategy == ExecutionStrategy::DeleteToTrash
                && record.status == ActionRecordStatus::Completed
                && record
                    .destination_path
                    .as_ref()
                    .is_some_and(|path| path.contains(".safepath-trash"))
        }));

        let _ = fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn duplicate_holding_paths_are_disambiguated_for_same_named_files() {
        let temp_dir = std::env::temp_dir().join(format!("safepath-dup-collision-{}", Uuid::new_v4()));
        let first_dir = temp_dir.join("camera-a");
        let second_dir = temp_dir.join("camera-b");
        fs::create_dir_all(&first_dir).expect("create first dir");
        fs::create_dir_all(&second_dir).expect("create second dir");

        let keeper = first_dir.join("IMG_0001.JPG");
        let duplicate_a = first_dir.join("IMG_0002.JPG");
        let duplicate_b = second_dir.join("IMG_0002.JPG");
        fs::write(&keeper, b"same").expect("write keeper");
        fs::write(&duplicate_a, b"same").expect("write duplicate a");
        fs::write(&duplicate_b, b"same").expect("write duplicate b");

        let plan_root = temp_dir.join("organized");
        fs::create_dir_all(&plan_root).expect("create plan root");

        let keeper_action = PlannedActionDto {
            action_id: "keeper-action".to_string(),
            source_entry_id: "keeper-entry".to_string(),
            source_path: keeper.to_string_lossy().to_string(),
            destination_path: None,
            duplicate_group_id: Some("group-1".to_string()),
            action_kind: PlannedActionKind::Review,
            review_state: ReviewState::Approved,
            explanation: sample_explanation(),
        };
        let duplicate_action_a = PlannedActionDto {
            action_id: "duplicate-action-a".to_string(),
            source_entry_id: "duplicate-entry-a".to_string(),
            source_path: duplicate_a.to_string_lossy().to_string(),
            destination_path: None,
            duplicate_group_id: Some("group-1".to_string()),
            action_kind: PlannedActionKind::Review,
            review_state: ReviewState::Approved,
            explanation: sample_explanation(),
        };
        let duplicate_action_b = PlannedActionDto {
            action_id: "duplicate-action-b".to_string(),
            source_entry_id: "duplicate-entry-b".to_string(),
            source_path: duplicate_b.to_string_lossy().to_string(),
            destination_path: None,
            duplicate_group_id: Some("group-1".to_string()),
            action_kind: PlannedActionKind::Review,
            review_state: ReviewState::Approved,
            explanation: sample_explanation(),
        };

        let duplicate_group = PlanDuplicateGroupDto {
            group_id: "group-1".to_string(),
            certainty: DuplicateCertainty::Definite,
            representative_name: "IMG_0002.JPG".to_string(),
            item_count: 3,
            member_action_ids: vec![
                "keeper-action".to_string(),
                "duplicate-action-a".to_string(),
                "duplicate-action-b".to_string(),
            ],
            member_entry_ids: vec![
                "keeper-entry".to_string(),
                "duplicate-entry-a".to_string(),
                "duplicate-entry-b".to_string(),
            ],
            selected_keeper_entry_id: Some("keeper-entry".to_string()),
            recommended_keeper_entry_id: Some("keeper-entry".to_string()),
            recommended_keeper_reason: Some("Newest file".to_string()),
            recommended_keeper_confidence: Some(0.8),
            recommended_keeper_reason_tags: vec!["newest available timestamp".to_string()],
            match_basis: None,
            confidence: None,
            evidence: None,
            match_explanation: None,
            stable_group_key: None,
        };

        let mut plan = sample_plan(
            vec![keeper_action, duplicate_action_a, duplicate_action_b],
            vec![duplicate_group],
        );
        plan.destination_root = plan_root.to_string_lossy().to_string();

        let session = execute_plan(&mut plan);

        let moved_paths = session
            .records
            .iter()
            .filter(|record| {
                record.strategy == ExecutionStrategy::DuplicateConsolidate
                    && record.status == ActionRecordStatus::Completed
            })
            .filter_map(|record| record.destination_path.clone())
            .collect::<Vec<_>>();

        assert_eq!(session.status, ExecutionSessionStatus::Completed);
        assert_eq!(moved_paths.len(), 2);
        assert_ne!(moved_paths[0], moved_paths[1]);
        assert!(moved_paths.iter().all(|path| path.contains("--duplicate-entry")));

        let _ = fs::remove_dir_all(temp_dir);
    }

    fn sample_plan(
        actions: Vec<PlannedActionDto>,
        duplicate_groups: Vec<PlanDuplicateGroupDto>,
    ) -> PlanDto {
        PlanDto {
            plan_id: "plan-1".to_string(),
            job_id: "job-1".to_string(),
            preset_id: "general_organize".to_string(),
            preset_name: "General Organize".to_string(),
            destination_root: "/tmp".to_string(),
            plan_options: crate::PlanOptionsDto {
                checksum_mode: crate::ChecksumMode::Off,
                duplicate_policy: crate::DuplicatePolicy::FlagOnly,
                review_mode: crate::ReviewMode::Standard,
                project_safety_mode: crate::ProjectSafetyMode::On,
                fallback_behavior: crate::FallbackBehavior::Skip,
            },
            summary: PlanSummaryDto {
                total_actions: actions.len() as u32,
                move_actions: actions
                    .iter()
                    .filter(|action| action.action_kind == PlannedActionKind::Move)
                    .count() as u32,
                review_actions: actions
                    .iter()
                    .filter(|action| action.action_kind == PlannedActionKind::Review)
                    .count() as u32,
                blocked_actions: 0,
                skipped_actions: 0,
            },
            duplicate_groups,
            actions,
            config_fingerprint: None,
            duplicate_config_snapshot: None,
        }
    }

    fn sample_move_action(source_path: String, destination_path: String) -> PlannedActionDto {
        PlannedActionDto {
            action_id: "action-1".to_string(),
            source_entry_id: "entry-1".to_string(),
            source_path,
            destination_path: Some(destination_path),
            duplicate_group_id: None,
            action_kind: PlannedActionKind::Move,
            review_state: ReviewState::Approved,
            explanation: sample_explanation(),
        }
    }

    fn sample_explanation() -> ActionExplanationDto {
        ActionExplanationDto {
            matched_preset: "general_organize".to_string(),
            matched_rule: Some("rule-1".to_string()),
            matched_conditions: Vec::new(),
            rule_priority: Some(1),
            confidence: 1.0,
            safety_flags: Vec::new(),
            duplicate_tier: None,
            protection_state: None,
            blocked_reason: None,
            destination_root: None,
            template_used: None,
            template_error: None,
            previewed_template_output: None,
            destination_conflict_path: None,
            conflict_status: Some(ConflictKind::NeedsUserChoice),
            notes: Vec::new(),
        }
    }
}
