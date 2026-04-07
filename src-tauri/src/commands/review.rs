use safepath_core::{
    learner, DuplicateReviewGroupDetailsDto, DuplicateReviewMemberDto, PlanDto,
    SetDuplicateKeeperRequest, UpdateReviewStateRequest,
};
use std::collections::HashMap;
use std::path::Path;
use std::process::Command;
use tauri::State;

use crate::AppState;

#[tauri::command]
pub fn get_plan(state: State<'_, AppState>, plan_id: String) -> Result<Option<PlanDto>, String> {
    state.store.get_plan(&plan_id)
}

#[tauri::command]
pub fn update_review_state(
    state: State<'_, AppState>,
    request: UpdateReviewStateRequest,
) -> Result<PlanDto, String> {
    let previous_plan = state
        .store
        .get_plan(&request.plan_id)?
        .ok_or_else(|| format!("Plan `{}` was not found.", request.plan_id))?;
    let updated_plan =
        state
            .store
            .update_review_state(&request.plan_id, &request.action_ids, request.decision)?;
    let observations = learner::build_review_decision_observations(
        &previous_plan,
        &updated_plan,
        &request.action_ids,
        request.decision,
    );
    for observation in observations {
        state.store.save_learner_observation(&observation)?;
    }
    Ok(updated_plan)
}

#[tauri::command]
pub fn set_duplicate_keeper(
    state: State<'_, AppState>,
    request: SetDuplicateKeeperRequest,
) -> Result<PlanDto, String> {
    let plan = state.store.set_duplicate_keeper(
        &request.plan_id,
        &request.group_id,
        &request.keeper_entry_id,
    )?;
    let group = plan
        .duplicate_groups
        .iter()
        .find(|group| group.group_id == request.group_id)
        .ok_or_else(|| format!("Duplicate group `{}` was not found.", request.group_id))?;
    let observation = learner::build_duplicate_keeper_observation(&plan, group, None)?;
    state.store.save_learner_observation(&observation)?;
    Ok(plan)
}

#[tauri::command]
pub fn get_duplicate_review_group_details(
    state: State<'_, AppState>,
    plan_id: String,
    group_id: String,
) -> Result<DuplicateReviewGroupDetailsDto, String> {
    let plan = state
        .store
        .get_plan(&plan_id)?
        .ok_or_else(|| format!("Plan `{plan_id}` was not found."))?;
    let group = plan
        .duplicate_groups
        .iter()
        .find(|group| group.group_id == group_id)
        .ok_or_else(|| format!("Duplicate group `{group_id}` was not found."))?;
    let entries_by_id = state
        .store
        .get_manifest_entries(&plan.job_id)?
        .into_iter()
        .map(|entry| (entry.entry_id.clone(), entry))
        .collect::<HashMap<_, _>>();
    let actions_by_entry_id = plan
        .actions
        .iter()
        .map(|action| (action.source_entry_id.clone(), action))
        .collect::<HashMap<_, _>>();

    let mut members = group
        .member_entry_ids
        .iter()
        .filter_map(|entry_id| {
            let entry = entries_by_id.get(entry_id)?;
            let action = actions_by_entry_id.get(entry_id);
            Some(DuplicateReviewMemberDto {
                entry_id: entry.entry_id.clone(),
                action_id: action.map(|item| item.action_id.clone()),
                path: entry.path.clone(),
                name: entry.name.clone(),
                size_bytes: entry.size_bytes,
                created_at_epoch_ms: entry.created_at_epoch_ms,
                modified_at_epoch_ms: entry.modified_at_epoch_ms,
                media_date_epoch_ms: entry.media_date_epoch_ms,
                media_date_source: entry.media_date_source,
                review_state: action.map(|item| item.review_state),
                is_selected_keeper: group.selected_keeper_entry_id.as_ref()
                    == Some(&entry.entry_id),
                is_recommended_keeper: group.recommended_keeper_entry_id.as_ref()
                    == Some(&entry.entry_id),
            })
        })
        .collect::<Vec<_>>();
    members.sort_by(|left, right| {
        right
            .is_selected_keeper
            .cmp(&left.is_selected_keeper)
            .then_with(|| right.is_recommended_keeper.cmp(&left.is_recommended_keeper))
            .then_with(|| left.path.cmp(&right.path))
    });

    Ok(DuplicateReviewGroupDetailsDto {
        group_id: group.group_id.clone(),
        representative_name: group.representative_name.clone(),
        certainty: group.certainty,
        item_count: group.item_count,
        selected_keeper_entry_id: group.selected_keeper_entry_id.clone(),
        recommended_keeper_entry_id: group.recommended_keeper_entry_id.clone(),
        recommended_keeper_reason: group.recommended_keeper_reason.clone(),
        recommended_keeper_confidence: group.recommended_keeper_confidence,
        recommended_keeper_reason_tags: group.recommended_keeper_reason_tags.clone(),
        members,
    })
}

#[tauri::command]
pub fn reveal_path_in_file_manager(path: String) -> Result<(), String> {
    let target = Path::new(&path);
    if !target.exists() {
        return Err(format!("Path `{path}` was not found."));
    }

    #[cfg(target_os = "macos")]
    let status = Command::new("open")
        .arg("-R")
        .arg(&path)
        .status()
        .map_err(|error| format!("Failed to reveal `{path}` in Finder: {error}"))?;

    #[cfg(target_os = "windows")]
    let status = {
        let path_arg = if target.is_dir() {
            path.replace('/', "\\")
        } else {
            format!("/select,{}", path.replace('/', "\\"))
        };
        Command::new("explorer")
            .arg(path_arg)
            .status()
            .map_err(|error| format!("Failed to reveal `{path}` in Explorer: {error}"))?
    };

    #[cfg(all(unix, not(target_os = "macos")))]
    let status = {
        let reveal_target = if target.is_dir() {
            target
        } else {
            target.parent().unwrap_or(target)
        };
        Command::new("xdg-open")
            .arg(reveal_target)
            .status()
            .map_err(|error| format!("Failed to reveal `{path}` in the file manager: {error}"))?
    };

    if status.success() {
        Ok(())
    } else {
        Err(format!(
            "The operating system file manager did not accept the reveal request for `{path}`."
        ))
    }
}
