use safepath_core::{
    executor, history, DuplicateWorkflowReportDto, ExecutePlanRequest, ExecutionCompletedEvent,
    ExecutionProgressEvent, ExecutionSessionDto, ExecutionSessionStatus, ManifestEntryDto,
    PlanDto, PreflightIssueDto, PreflightIssueSeverity, ReviewState, UndoRecordRequest,
    UndoSessionRequest, WorkflowPhase,
};
use std::collections::HashMap;
use std::fs;
use std::thread;
use std::time::UNIX_EPOCH;
use tauri::{AppHandle, Emitter, State};

use crate::AppState;

#[tauri::command]
pub fn get_execution_preflight(
    state: State<'_, AppState>,
    plan_id: String,
) -> Result<Vec<PreflightIssueDto>, String> {
    let plan = state
        .store
        .get_plan(&plan_id)?
        .ok_or_else(|| format!("Plan `{plan_id}` was not found."))?;
    collect_execution_preflight_issues(state.inner(), &plan)
}

#[tauri::command]
pub fn export_duplicate_workflow_report(
    state: State<'_, AppState>,
    plan_id: String,
    output_path: String,
) -> Result<(), String> {
    let plan = state
        .store
        .get_plan(&plan_id)?
        .ok_or_else(|| format!("Plan `{plan_id}` was not found."))?;
    let preflight = collect_execution_preflight_issues(state.inner(), &plan)?;
    let job_id = plan.job_id.clone();
    let scan_job = state.store.get_scan_status(&job_id)?;
    let analysis_summary = state.store.get_analysis_summary(&job_id)?;
    let exported_at_epoch_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0);
    let report = DuplicateWorkflowReportDto {
        schema_version: 1,
        exported_at_epoch_ms,
        plan_id: plan_id.clone(),
        plan,
        scan_job,
        analysis_summary,
        execution_preflight: preflight,
    };
    let json = serde_json::to_string_pretty(&report).map_err(|error| error.to_string())?;
    fs::write(output_path, json).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn execute_plan(
    app: AppHandle,
    state: State<'_, AppState>,
    request: ExecutePlanRequest,
) -> Result<ExecutionSessionDto, String> {
    if state.selection_snapshot()?.workflow_phase == WorkflowPhase::Executing {
        return Err("An execution session is already running.".to_string());
    }

    state.set_workflow_phase(WorkflowPhase::Executing)?;
    let app_handle = app.clone();
    let app_state = state.inner().clone();
    let plan = app_state
        .store
        .get_plan(&request.plan_id)?
        .ok_or_else(|| format!("Plan `{}` was not found.", request.plan_id))?;
    let preflight_issues = collect_execution_preflight_issues(&app_state, &plan)?;
    let mut session = executor::initialize_execution_session(&plan);
    apply_preflight_issues(&mut session, preflight_issues);
    app_state.store.save_execution_session(&session)?;

    if session.status == safepath_core::ExecutionSessionStatus::Failed {
        app_state.set_workflow_phase(WorkflowPhase::Idle)?;
        return Ok(session);
    }

    let action_ids = executor::approved_action_ids(&plan);
    let initial_session = session.clone();
    let worker_session_id = initial_session.session_id.clone();
    thread::spawn(move || {
        if let Err(error) = run_execution_worker(
            app_handle.clone(),
            app_state.clone(),
            plan,
            session,
            action_ids,
        ) {
            let _ = app_state.set_workflow_phase(WorkflowPhase::Idle);
            let _ = app_handle.emit(
                "execution_completed",
                ExecutionCompletedEvent {
                    session_id: worker_session_id.clone(),
                    status: safepath_core::ExecutionSessionStatus::Failed,
                },
            );
            eprintln!("execution worker failed: {error}");
        }
    });

    Ok(initial_session)
}

#[tauri::command]
pub fn get_execution_status(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<Option<ExecutionSessionDto>, String> {
    state.store.get_execution_session(&session_id)
}

#[tauri::command]
pub fn undo_record(
    state: State<'_, AppState>,
    request: UndoRecordRequest,
) -> Result<ExecutionSessionDto, String> {
    guard_execution_phase(&state)?;
    state.set_workflow_phase(WorkflowPhase::Executing)?;

    let result = (|| -> Result<ExecutionSessionDto, String> {
        let original = state
            .store
            .get_action_record(&request.record_id)?
            .ok_or_else(|| format!("Action record `{}` was not found.", request.record_id))?;
        let original_session = state
            .store
            .get_execution_session(&original.session_id)?
            .ok_or_else(|| {
                format!(
                    "Execution session `{}` for record `{}` was not found.",
                    original.session_id, request.record_id
                )
            })?;
        let all_records = state.store.list_action_records()?;
        let already_undone =
            history::completed_undo_record_ids(&all_records).contains(&original.record_id);

        let mut undo_session = history::initialize_undo_session(
            &original_session.plan_id,
            Some(original.session_id.clone()),
            1,
        );
        state.store.save_execution_session(&undo_session)?;

        let undo_record =
            history::apply_undo_record(&original, &undo_session.session_id, already_undone);
        history::record_undo_outcome(&mut undo_session, undo_record.clone());
        state.store.append_action_record(&undo_record)?;
        state.store.save_execution_session(&undo_session)?;

        history::finalize_undo_session(&mut undo_session);
        state
            .store
            .reconcile_plan_after_undo(&undo_session.plan_id, &undo_session.records)?;
        state.store.save_execution_session(&undo_session)?;
        Ok(undo_session)
    })();

    state.set_workflow_phase(WorkflowPhase::Idle)?;
    result
}

#[tauri::command]
pub fn undo_session(
    state: State<'_, AppState>,
    request: UndoSessionRequest,
) -> Result<ExecutionSessionDto, String> {
    guard_execution_phase(&state)?;
    state.set_workflow_phase(WorkflowPhase::Executing)?;

    let result = (|| -> Result<ExecutionSessionDto, String> {
        let original_session = state
            .store
            .get_execution_session(&request.session_id)?
            .ok_or_else(|| format!("Execution session `{}` was not found.", request.session_id))?;

        if original_session.operation_kind == safepath_core::ExecutionOperationKind::Undo {
            return Err("Undo sessions cannot be undone again.".to_string());
        }

        let mut undone_record_ids =
            history::completed_undo_record_ids(&state.store.list_action_records()?);
        let original_records = original_session.records.clone();
        let mut undo_session = history::initialize_undo_session(
            &original_session.plan_id,
            Some(original_session.session_id.clone()),
            original_records.len() as u32,
        );
        state.store.save_execution_session(&undo_session)?;

        for record in original_records.into_iter().rev() {
            let undo_record = history::apply_undo_record(
                &record,
                &undo_session.session_id,
                undone_record_ids.contains(&record.record_id),
            );
            if undo_record.status == safepath_core::ActionRecordStatus::Completed {
                undone_record_ids.insert(record.record_id.clone());
            }
            history::record_undo_outcome(&mut undo_session, undo_record.clone());
            state.store.append_action_record(&undo_record)?;
            state.store.save_execution_session(&undo_session)?;
        }

        history::finalize_undo_session(&mut undo_session);
        state
            .store
            .reconcile_plan_after_undo(&undo_session.plan_id, &undo_session.records)?;
        state.store.save_execution_session(&undo_session)?;
        Ok(undo_session)
    })();

    state.set_workflow_phase(WorkflowPhase::Idle)?;
    result
}

fn run_execution_worker(
    app: AppHandle,
    state: AppState,
    mut plan: PlanDto,
    mut session: ExecutionSessionDto,
    action_ids: Vec<String>,
) -> Result<(), String> {
    for action_id in action_ids {
        let record = executor::execute_action_by_id(&mut plan, &action_id, &mut session)?;
        state.store.replace_plan(&plan)?;
        state.store.append_action_record(&record)?;
        state.store.save_execution_session(&session)?;
        let _ = app.emit(
            "execution_progress",
            ExecutionProgressEvent {
                session_id: session.session_id.clone(),
                completed_action_count: session.completed_action_count
                    + session.failed_action_count
                    + session.skipped_action_count,
                total_actions: session.approved_action_count,
                current_action_id: Some(record.action_id.clone()),
                message: executor::progress_message(&record),
            },
        );
    }

    executor::finalize_execution_session(&mut session);
    state.store.replace_plan(&plan)?;
    state.store.save_execution_session(&session)?;
    let _ = app.emit(
        "execution_completed",
        ExecutionCompletedEvent {
            session_id: session.session_id.clone(),
            status: session.status,
        },
    );
    state.set_workflow_phase(WorkflowPhase::Idle)?;
    Ok(())
}

fn guard_execution_phase(state: &State<'_, AppState>) -> Result<(), String> {
    if state.selection_snapshot()?.workflow_phase == WorkflowPhase::Executing {
        return Err("An execution or undo session is already running.".to_string());
    }
    Ok(())
}

fn collect_execution_preflight_issues(
    state: &AppState,
    plan: &PlanDto,
) -> Result<Vec<PreflightIssueDto>, String> {
    let mut issues = executor::preflight_plan(plan);
    issues.extend(plan_duplicate_fingerprint_issues(state, plan)?);
    issues.extend(drift_preflight_warnings(state, plan)?);
    Ok(issues)
}

fn plan_duplicate_fingerprint_issues(
    state: &AppState,
    plan: &PlanDto,
) -> Result<Vec<PreflightIssueDto>, String> {
    let Some(expected) = plan.config_fingerprint.as_ref() else {
        return Ok(Vec::new());
    };
    let job_fp = state.store.get_scan_job_fingerprint(&plan.job_id)?;
    if job_fp.as_ref() == Some(expected) {
        return Ok(Vec::new());
    }
    if job_fp.is_none() {
        return Ok(vec![PreflightIssueDto {
            action_id: None,
            severity: PreflightIssueSeverity::Warning,
            message: "This job has no stored duplicate configuration fingerprint; rebuild the plan after upgrading for full execution trust checks.".to_string(),
        }]);
    }
    Ok(vec![PreflightIssueDto {
        action_id: None,
        severity: PreflightIssueSeverity::Blocking,
        message: "Duplicate configuration changed since this plan was built. Re-run analysis and rebuild the plan before executing.".to_string(),
    }])
}

fn drift_preflight_warnings(
    state: &AppState,
    plan: &PlanDto,
) -> Result<Vec<PreflightIssueDto>, String> {
    let entry_lookup = state
        .store
        .get_manifest_entries(&plan.job_id)?
        .into_iter()
        .map(|entry| (entry.entry_id.clone(), entry))
        .collect::<HashMap<String, ManifestEntryDto>>();
    let mut issues = Vec::new();

    for action in plan
        .actions
        .iter()
        .filter(|action| action.review_state == ReviewState::Approved)
    {
        let Some(entry) = entry_lookup.get(&action.source_entry_id) else {
            continue;
        };

        let Ok(metadata) = fs::metadata(&action.source_path) else {
            continue;
        };

        let mut drift_reasons = Vec::new();
        if metadata.len() != entry.size_bytes {
            drift_reasons.push(format!(
                "size changed from {} bytes to {} bytes",
                entry.size_bytes,
                metadata.len()
            ));
        }

        let current_modified_at = metadata.modified().ok().and_then(system_time_to_epoch_ms);
        if let (Some(recorded_modified_at), Some(current_modified_at)) =
            (entry.modified_at_epoch_ms, current_modified_at)
        {
            if recorded_modified_at.abs_diff(current_modified_at) > 1_000 {
                drift_reasons.push("modified time changed".to_string());
            }
        }

        if drift_reasons.is_empty() {
            continue;
        }

        issues.push(PreflightIssueDto {
            action_id: Some(action.action_id.clone()),
            severity: PreflightIssueSeverity::Warning,
            message: format!(
                "Source path `{}` changed since the last scan ({}). Review the action or rebuild the plan before executing if the change matters.",
                action.source_path,
                drift_reasons.join(", ")
            ),
        });
    }

    Ok(issues)
}

fn apply_preflight_issues(
    session: &mut ExecutionSessionDto,
    preflight_issues: Vec<PreflightIssueDto>,
) {
    session.preflight_issues = preflight_issues;
    let has_errors = session
        .preflight_issues
        .iter()
        .any(|issue| issue.severity == PreflightIssueSeverity::Blocking);
    if has_errors {
        session.status = ExecutionSessionStatus::Failed;
        session.finished_at_epoch_ms = Some(session.started_at_epoch_ms);
    } else {
        session.status = ExecutionSessionStatus::Running;
        session.finished_at_epoch_ms = None;
    }
}

fn system_time_to_epoch_ms(time: std::time::SystemTime) -> Option<i64> {
    let duration = time.duration_since(UNIX_EPOCH).ok()?;
    Some(duration.as_millis() as i64)
}
