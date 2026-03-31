use safepath_core::{
    planner, presets, BuildPlanRequest, PlanDto, PlanReadyEvent, PresetDefinitionDto, WorkflowPhase,
};
use tauri::{AppHandle, Emitter, State};

use crate::AppState;

#[tauri::command]
pub fn get_presets(state: State<'_, AppState>) -> Result<Vec<PresetDefinitionDto>, String> {
    let presets = presets::built_in_presets();
    state.store.upsert_presets(&presets)?;
    state.store.list_presets()
}

#[tauri::command]
pub fn build_plan(
    app: AppHandle,
    state: State<'_, AppState>,
    request: BuildPlanRequest,
) -> Result<PlanDto, String> {
    state.set_workflow_phase(WorkflowPhase::Planning)?;
    let result = (|| -> Result<PlanDto, String> {
        let presets = presets::built_in_presets();
        state.store.upsert_presets(&presets)?;
        let preset = state
            .store
            .get_preset(&request.preset_id)?
            .ok_or_else(|| format!("Unknown preset `{}`.", request.preset_id))?;
        let analysis_summary = state
            .store
            .get_analysis_summary(&request.job_id)?
            .ok_or_else(|| "Run a scan before building a plan.".to_string())?;
        let entries = state.store.get_manifest_entries(&request.job_id)?;
        let destination_paths = state.selection_snapshot()?.destination_paths;
        let plan = planner::build_plan(
            &request.job_id,
            &entries,
            &analysis_summary,
            &preset,
            &destination_paths,
        )?;
        state.store.save_plan(&plan)?;
        Ok(plan)
    })();
    state.set_workflow_phase(WorkflowPhase::Idle)?;

    let plan = result?;
    app.emit(
        "plan_ready",
        PlanReadyEvent {
            plan_id: plan.plan_id.clone(),
            job_id: plan.job_id.clone(),
            preset_id: plan.preset_id.clone(),
            action_count: plan.summary.total_actions,
        },
    )
    .map_err(|error| error.to_string())?;
    Ok(plan)
}
