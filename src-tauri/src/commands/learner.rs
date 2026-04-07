use safepath_core::{
    evaluation, presets, AiEvaluationSnapshotDto, LearnerDraftPreviewDto, LearnerObservationDto,
    LearnerSuggestionDto,
    PresetDefinitionDto, RecordLearnerSuggestionFeedbackRequest, SaveLearnerDraftPreviewRequest,
};
use tauri::State;

use crate::AppState;

#[tauri::command]
pub fn get_learner_observations(
    state: State<'_, AppState>,
    limit: u32,
) -> Result<Vec<LearnerObservationDto>, String> {
    state.store.list_learner_observations(limit)
}

#[tauri::command]
pub fn get_learner_suggestions(
    state: State<'_, AppState>,
    observation_limit: u32,
    suggestion_limit: u32,
) -> Result<Vec<LearnerSuggestionDto>, String> {
    state
        .store
        .list_learner_suggestions(observation_limit, suggestion_limit)
}

#[tauri::command]
pub fn get_learner_draft_previews(
    state: State<'_, AppState>,
    observation_limit: u32,
    suggestion_limit: u32,
) -> Result<Vec<LearnerDraftPreviewDto>, String> {
    state.store.upsert_presets(&presets::built_in_presets())?;
    state
        .store
        .list_learner_draft_previews(observation_limit, suggestion_limit)
}

#[tauri::command]
pub fn get_ai_evaluation_snapshot(
    state: State<'_, AppState>,
    observation_limit: u32,
) -> Result<AiEvaluationSnapshotDto, String> {
    let observations = state.store.list_learner_observations(observation_limit)?;
    Ok(evaluation::build_ai_evaluation_snapshot(&observations))
}

#[tauri::command]
pub fn record_learner_suggestion_feedback(
    state: State<'_, AppState>,
    request: RecordLearnerSuggestionFeedbackRequest,
) -> Result<(), String> {
    state.store.save_learner_suggestion_feedback(&request)
}

#[tauri::command]
pub fn save_learner_draft_as_preset(
    state: State<'_, AppState>,
    request: SaveLearnerDraftPreviewRequest,
) -> Result<PresetDefinitionDto, String> {
    state.store.upsert_presets(&presets::built_in_presets())?;
    state.store.save_learner_draft_as_preset(&request)
}
