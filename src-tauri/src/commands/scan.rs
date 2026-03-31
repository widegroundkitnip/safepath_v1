use safepath_core::{
    analyzer, scanner, AnalysisProgressEvent, AnalysisStage, AnalysisSummaryDto, HistoryPageDto,
    ManifestPageDto, PermissionReadinessState, ProtectionOverrideDto, ProtectionOverrideKind,
    ScanJobState, ScanJobStatusDto, ScanPageReadyEvent, ScanProgressEvent, ScanStartedEvent,
    StartScanRequest, WorkflowPhase,
};
use tauri::{AppHandle, Emitter, State};

use crate::AppState;

const DEFAULT_PAGE_SIZE: u32 = 100;

#[tauri::command]
pub fn start_scan(
    app: AppHandle,
    state: State<'_, AppState>,
    request: StartScanRequest,
) -> Result<ScanJobStatusDto, String> {
    state.set_source_paths(request.source_paths.clone())?;
    let selection = state.selection_snapshot()?;

    if selection.source_paths.is_empty() {
        return Err("At least one source path is required.".to_string());
    }

    let readiness = crate::permissions::permissions_readiness(
        &selection.source_paths,
        &selection.destination_paths,
    );
    if !matches!(readiness.state, PermissionReadinessState::Ready) {
        let details = if readiness.details.is_empty() {
            String::new()
        } else {
            format!(" {}", readiness.details.join(" "))
        };
        return Err(format!("{}{}", readiness.summary, details));
    }

    let job = state
        .store
        .create_scan_job(&selection.source_paths, DEFAULT_PAGE_SIZE)?;
    state
        .store
        .set_scan_state(&job.job_id, ScanJobState::Running, None)?;
    state.set_workflow_phase(WorkflowPhase::Scanning)?;

    let status = state
        .store
        .get_scan_status(&job.job_id)?
        .ok_or_else(|| "Scan job could not be reloaded after creation.".to_string())?;

    app.emit(
        "scan_started",
        ScanStartedEvent {
            job_id: status.job_id.clone(),
            source_paths: status.source_paths.clone(),
        },
    )
    .map_err(|error| error.to_string())?;

    let worker_app = app.clone();
    let worker_state = state.inner().clone();
    let job_id = status.job_id.clone();
    let source_paths = status.source_paths.clone();

    std::thread::spawn(move || {
        let result = scanner::scan_sources(
            &source_paths,
            |entry| {
                let discovered_entries =
                    worker_state.store.record_manifest_entry(&job_id, &entry)?;
                if discovered_entries == 1 || discovered_entries % u64::from(DEFAULT_PAGE_SIZE) == 0
                {
                    let page = ((discovered_entries - 1) / u64::from(DEFAULT_PAGE_SIZE)) as u32;
                    let _ = worker_app.emit(
                        "scan_page_ready",
                        ScanPageReadyEvent {
                            job_id: job_id.clone(),
                            page,
                            page_size: DEFAULT_PAGE_SIZE,
                            total_entries: discovered_entries,
                        },
                    );
                }
                Ok(())
            },
            |progress| {
                let _ = worker_app.emit(
                    "scan_progress",
                    ScanProgressEvent {
                        job_id: job_id.clone(),
                        discovered_entries: progress.discovered_entries,
                        scanned_files: progress.scanned_files,
                        scanned_directories: progress.scanned_directories,
                        latest_path: progress.latest_path,
                    },
                );
                Ok(())
            },
            || worker_state.is_cancelled(&job_id),
        );

        match result {
            Ok(()) => {
                let (final_state, final_error) = if worker_state.is_cancelled(&job_id) {
                    (ScanJobState::Cancelled, None)
                } else {
                    let _ = worker_state.set_workflow_phase(WorkflowPhase::Analyzing);
                    let _ = worker_app.emit(
                        "analysis_progress",
                        AnalysisProgressEvent {
                            job_id: job_id.clone(),
                            stage: AnalysisStage::Started,
                        },
                    );

                    let analysis_result = (|| -> Result<(), String> {
                        let entries = worker_state.store.get_manifest_entries(&job_id)?;
                        let protection_overrides = worker_state.store.get_protection_overrides()?;
                        let summary =
                            analyzer::analyze_manifest(&job_id, &entries, &protection_overrides);
                        worker_state.store.save_analysis_summary(&summary)?;
                        Ok(())
                    })();

                    match analysis_result {
                        Ok(()) => {
                            let _ = worker_app.emit(
                                "analysis_progress",
                                AnalysisProgressEvent {
                                    job_id: job_id.clone(),
                                    stage: AnalysisStage::Completed,
                                },
                            );
                            (ScanJobState::Completed, None)
                        }
                        Err(error) => {
                            let _ = worker_app.emit(
                                "job_failed",
                                serde_json::json!({
                                    "jobId": job_id,
                                    "message": error,
                                }),
                            );
                            (ScanJobState::Failed, Some(error))
                        }
                    }
                };
                let _ =
                    worker_state
                        .store
                        .set_scan_state(&job_id, final_state, final_error.as_deref());
                let _ = worker_state.set_workflow_phase(WorkflowPhase::Idle);
            }
            Err(error) => {
                let _ =
                    worker_state
                        .store
                        .set_scan_state(&job_id, ScanJobState::Failed, Some(&error));
                let _ = worker_state.set_workflow_phase(WorkflowPhase::Idle);
                let _ = worker_app.emit(
                    "job_failed",
                    serde_json::json!({
                        "jobId": job_id,
                        "message": error,
                    }),
                );
            }
        }
    });

    Ok(status)
}

#[tauri::command]
pub fn cancel_scan(state: State<'_, AppState>, job_id: String) -> Result<ScanJobStatusDto, String> {
    state.request_cancel(&job_id)?;
    state
        .store
        .set_scan_state(&job_id, ScanJobState::Cancelled, None)?;
    state.set_workflow_phase(WorkflowPhase::Idle)?;
    state
        .store
        .get_scan_status(&job_id)?
        .ok_or_else(|| "Scan job not found.".to_string())
}

#[tauri::command]
pub fn get_scan_status(
    state: State<'_, AppState>,
    job_id: String,
) -> Result<Option<ScanJobStatusDto>, String> {
    state.store.get_scan_status(&job_id)
}

#[tauri::command]
pub fn get_manifest_page(
    state: State<'_, AppState>,
    job_id: String,
    page: u32,
    page_size: u32,
) -> Result<ManifestPageDto, String> {
    state.store.get_manifest_page(&job_id, page, page_size)
}

#[tauri::command]
pub fn get_history_page(
    state: State<'_, AppState>,
    page: u32,
    page_size: u32,
) -> Result<HistoryPageDto, String> {
    state.store.get_history_page(page, page_size)
}

#[tauri::command]
pub fn get_analysis_summary(
    state: State<'_, AppState>,
    job_id: String,
) -> Result<Option<AnalysisSummaryDto>, String> {
    state.store.get_analysis_summary(&job_id)
}

#[tauri::command]
pub fn set_protection_override(
    state: State<'_, AppState>,
    path: String,
    override_kind: ProtectionOverrideKind,
) -> Result<ProtectionOverrideDto, String> {
    state.store.set_protection_override(&path, override_kind)
}

#[tauri::command]
pub fn run_expensive_analysis(
    app: AppHandle,
    state: State<'_, AppState>,
    job_id: String,
) -> Result<AnalysisSummaryDto, String> {
    state.set_workflow_phase(WorkflowPhase::Analyzing)?;
    app.emit(
        "analysis_progress",
        AnalysisProgressEvent {
            job_id: job_id.clone(),
            stage: AnalysisStage::Started,
        },
    )
    .map_err(|error| error.to_string())?;

    let result = (|| -> Result<AnalysisSummaryDto, String> {
        let entries = state.store.get_manifest_entries(&job_id)?;
        let protection_overrides = state.store.get_protection_overrides()?;
        let summary = analyzer::run_expensive_analysis(&job_id, &entries, &protection_overrides)?;
        state.store.save_analysis_summary(&summary)?;
        Ok(summary)
    })();

    state.set_workflow_phase(WorkflowPhase::Idle)?;

    match result {
        Ok(summary) => {
            app.emit(
                "analysis_progress",
                AnalysisProgressEvent {
                    job_id,
                    stage: AnalysisStage::Completed,
                },
            )
            .map_err(|error| error.to_string())?;
            Ok(summary)
        }
        Err(error) => {
            app.emit(
                "job_failed",
                serde_json::json!({
                    "jobId": job_id,
                    "message": error,
                }),
            )
            .map_err(|emit_error| emit_error.to_string())?;
            Err(error)
        }
    }
}
