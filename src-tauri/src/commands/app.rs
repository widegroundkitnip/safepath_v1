use safepath_core::AppStatusDto;
use tauri::State;

use crate::AppState;

#[tauri::command]
pub fn get_app_status(state: State<'_, AppState>) -> Result<AppStatusDto, String> {
    build_status(state.inner())
}

#[tauri::command]
pub fn select_sources(
    state: State<'_, AppState>,
    paths: Vec<String>,
) -> Result<AppStatusDto, String> {
    state.set_source_paths(paths)?;
    build_status(state.inner())
}

#[tauri::command]
pub fn select_destinations(
    state: State<'_, AppState>,
    paths: Vec<String>,
) -> Result<AppStatusDto, String> {
    state.set_destination_paths(paths)?;
    build_status(state.inner())
}

fn build_status(state: &AppState) -> Result<AppStatusDto, String> {
    let selection = state.selection_snapshot()?;
    let permissions_readiness = crate::permissions::permissions_readiness(
        &selection.source_paths,
        &selection.destination_paths,
    );

    Ok(safepath_core::build_app_status(
        std::env::consts::OS,
        selection.workflow_phase,
        permissions_readiness,
        selection.source_paths,
        selection.destination_paths,
    ))
}
