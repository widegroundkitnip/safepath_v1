#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod permissions;

use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use commands::app::{get_app_status, select_destinations, select_sources};
use commands::execution::{execute_plan, get_execution_status, undo_record, undo_session};
use commands::learner::{
    get_learner_draft_previews, get_learner_observations, get_learner_suggestions,
    record_learner_suggestion_feedback, save_learner_draft_as_preset,
};
use commands::planning::{build_plan, get_presets};
use commands::review::{get_plan, set_duplicate_keeper, update_review_state};
use commands::scan::{
    cancel_scan, get_analysis_summary, get_history_page, get_manifest_page, get_scan_status,
    run_expensive_analysis, set_protection_override, start_scan,
};
use commands::test_data::generate_synthetic_dataset;
use safepath_core::WorkflowPhase;
use safepath_store::Store;
use tauri::Manager;

#[derive(Clone)]
struct SelectionState {
    source_paths: Vec<String>,
    destination_paths: Vec<String>,
    workflow_phase: WorkflowPhase,
}

impl Default for SelectionState {
    fn default() -> Self {
        Self {
            source_paths: Vec::new(),
            destination_paths: Vec::new(),
            workflow_phase: WorkflowPhase::Idle,
        }
    }
}

#[derive(Clone)]
pub struct AppState {
    pub store: Store,
    cancellations: Arc<Mutex<HashSet<String>>>,
    selection: Arc<Mutex<SelectionState>>,
}

impl AppState {
    fn new(store: Store) -> Self {
        Self {
            store,
            cancellations: Arc::new(Mutex::new(HashSet::new())),
            selection: Arc::new(Mutex::new(SelectionState::default())),
        }
    }

    fn request_cancel(&self, job_id: &str) -> Result<(), String> {
        let mut cancellations = self
            .cancellations
            .lock()
            .map_err(|_| "Failed to lock cancellation state.".to_string())?;
        cancellations.insert(job_id.to_string());
        Ok(())
    }

    fn is_cancelled(&self, job_id: &str) -> bool {
        self.cancellations
            .lock()
            .map(|cancellations| cancellations.contains(job_id))
            .unwrap_or(false)
    }

    fn selection_snapshot(&self) -> Result<SelectionState, String> {
        self.selection
            .lock()
            .map(|selection| selection.clone())
            .map_err(|_| "Failed to lock selection state.".to_string())
    }

    fn set_source_paths(&self, source_paths: Vec<String>) -> Result<(), String> {
        let mut selection = self
            .selection
            .lock()
            .map_err(|_| "Failed to lock selection state.".to_string())?;
        selection.source_paths = normalize_paths(source_paths);
        Ok(())
    }

    fn set_destination_paths(&self, destination_paths: Vec<String>) -> Result<(), String> {
        let mut selection = self
            .selection
            .lock()
            .map_err(|_| "Failed to lock selection state.".to_string())?;
        selection.destination_paths = normalize_paths(destination_paths);
        Ok(())
    }

    fn set_workflow_phase(&self, workflow_phase: WorkflowPhase) -> Result<(), String> {
        let mut selection = self
            .selection
            .lock()
            .map_err(|_| "Failed to lock selection state.".to_string())?;
        selection.workflow_phase = workflow_phase;
        Ok(())
    }
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let store = Store::new(app_db_path(app)?)?;
            app.manage(AppState::new(store));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_app_status,
            select_sources,
            select_destinations,
            get_presets,
            build_plan,
            get_plan,
            update_review_state,
            set_duplicate_keeper,
            execute_plan,
            get_execution_status,
            undo_record,
            undo_session,
            get_learner_observations,
            get_learner_suggestions,
            get_learner_draft_previews,
            record_learner_suggestion_feedback,
            save_learner_draft_as_preset,
            start_scan,
            cancel_scan,
            get_scan_status,
            get_manifest_page,
            get_history_page,
            get_analysis_summary,
            set_protection_override,
            run_expensive_analysis,
            generate_synthetic_dataset
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Safepath");
}

fn app_db_path<R: tauri::Runtime>(app: &tauri::App<R>) -> Result<PathBuf, String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    std::fs::create_dir_all(&app_dir).map_err(|error| error.to_string())?;
    Ok(app_dir.join("safepath.sqlite3"))
}

fn normalize_paths(paths: Vec<String>) -> Vec<String> {
    let mut normalized = Vec::new();
    for path in paths {
        let trimmed = path.trim();
        if trimmed.is_empty() || normalized.iter().any(|existing| existing == trimmed) {
            continue;
        }
        normalized.push(trimmed.to_string());
    }
    normalized
}
