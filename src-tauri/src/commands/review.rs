use safepath_core::{learner, PlanDto, SetDuplicateKeeperRequest, UpdateReviewStateRequest};
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
