use safepath_core::{
    executor, history, ExecutePlanRequest, ExecutionCompletedEvent, ExecutionProgressEvent,
    ExecutionSessionDto, PlanDto, UndoRecordRequest, UndoSessionRequest, WorkflowPhase,
};
use std::thread;
use tauri::{AppHandle, Emitter, State};

use crate::AppState;

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
    let session = executor::initialize_execution_session(&plan);
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
        let _ = state
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
        let _ = state
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
