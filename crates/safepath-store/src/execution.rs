use rusqlite::{params, Connection, OptionalExtension};
use safepath_core::{ActionRecordDto, ExecutionSessionDto};

use crate::util::{action_record_status_code, execution_operation_kind_code};
use crate::Store;

impl Store {
    pub fn save_execution_session(&self, session: &ExecutionSessionDto) -> Result<(), String> {
        let connection = self.connection()?;
        let payload_json = serde_json::to_string(session).map_err(|error| error.to_string())?;
        connection
            .execute(
                "INSERT INTO execution_sessions (session_id, plan_id, payload_json)
                 VALUES (?1, ?2, ?3)
                 ON CONFLICT(session_id) DO UPDATE SET payload_json = excluded.payload_json",
                params![session.session_id, session.plan_id, payload_json],
            )
            .map_err(|error| error.to_string())?;
        Ok(())
    }

    pub fn append_action_record(&self, record: &ActionRecordDto) -> Result<(), String> {
        let connection = self.connection()?;
        let payload_json = serde_json::to_string(record).map_err(|error| error.to_string())?;
        connection
            .execute(
                "INSERT INTO action_records (
                    record_id,
                    session_id,
                    operation_kind,
                    related_record_id,
                    status,
                    payload_json
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    record.record_id,
                    record.session_id,
                    execution_operation_kind_code(record.operation_kind),
                    record.related_record_id,
                    action_record_status_code(record.status),
                    payload_json
                ],
            )
            .map_err(|error| error.to_string())?;
        Ok(())
    }

    pub fn get_execution_session(
        &self,
        session_id: &str,
    ) -> Result<Option<ExecutionSessionDto>, String> {
        let connection = self.connection()?;
        load_execution_session(&connection, session_id)
    }

    pub fn get_action_record(&self, record_id: &str) -> Result<Option<ActionRecordDto>, String> {
        let connection = self.connection()?;
        load_action_record(&connection, record_id)
    }

    pub fn list_action_records(&self) -> Result<Vec<ActionRecordDto>, String> {
        let connection = self.connection()?;
        load_action_records(
            &connection,
            "SELECT payload_json FROM action_records ORDER BY rowid ASC",
            params![],
        )
    }

    pub fn get_session_action_records(
        &self,
        session_id: &str,
    ) -> Result<Vec<ActionRecordDto>, String> {
        let connection = self.connection()?;
        load_action_records(
            &connection,
            "SELECT payload_json FROM action_records WHERE session_id = ?1 ORDER BY rowid ASC",
            params![session_id],
        )
    }
}

fn load_execution_session(
    connection: &Connection,
    session_id: &str,
) -> Result<Option<ExecutionSessionDto>, String> {
    let payload = connection
        .query_row(
            "SELECT payload_json FROM execution_sessions WHERE session_id = ?1",
            params![session_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;

    let Some(json) = payload else {
        return Ok(None);
    };

    let mut session =
        serde_json::from_str::<ExecutionSessionDto>(&json).map_err(|error| error.to_string())?;
    session.records = load_action_records(
        connection,
        "SELECT payload_json FROM action_records WHERE session_id = ?1 ORDER BY rowid ASC",
        params![session_id],
    )?;
    Ok(Some(session))
}

fn load_action_record(
    connection: &Connection,
    record_id: &str,
) -> Result<Option<ActionRecordDto>, String> {
    let payload = connection
        .query_row(
            "SELECT payload_json FROM action_records WHERE record_id = ?1",
            params![record_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;

    payload
        .map(|json| {
            serde_json::from_str::<ActionRecordDto>(&json).map_err(|error| error.to_string())
        })
        .transpose()
}

fn load_action_records<P>(
    connection: &Connection,
    sql: &str,
    params: P,
) -> Result<Vec<ActionRecordDto>, String>
where
    P: rusqlite::Params,
{
    let mut statement = connection.prepare(sql).map_err(|error| error.to_string())?;
    let rows = statement
        .query_map(params, |row| row.get::<_, String>(0))
        .map_err(|error| error.to_string())?;
    rows.map(|row| {
        row.map_err(|error| error.to_string()).and_then(|json| {
            serde_json::from_str::<ActionRecordDto>(&json).map_err(|error| error.to_string())
        })
    })
    .collect::<Result<Vec<_>, _>>()
}
