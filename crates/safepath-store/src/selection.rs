use rusqlite::{params, OptionalExtension};
use safepath_core::PersistedSelectionStateDto;

use crate::Store;

const SELECTION_STATE_KEY: &str = "selection_state";

impl Store {
    pub fn load_selection_state(&self) -> Result<Option<PersistedSelectionStateDto>, String> {
        let connection = self.connection()?;
        let payload = connection
            .query_row(
                "SELECT payload_json FROM app_state WHERE state_key = ?1",
                params![SELECTION_STATE_KEY],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(|error| error.to_string())?;

        payload
            .map(|json| serde_json::from_str::<PersistedSelectionStateDto>(&json))
            .transpose()
            .map_err(|error| error.to_string())
    }

    pub fn save_selection_state(
        &self,
        selection: &PersistedSelectionStateDto,
    ) -> Result<(), String> {
        let connection = self.connection()?;
        let payload_json = serde_json::to_string(selection).map_err(|error| error.to_string())?;

        connection
            .execute(
                "INSERT INTO app_state (state_key, payload_json)
                 VALUES (?1, ?2)
                 ON CONFLICT(state_key) DO UPDATE SET payload_json = excluded.payload_json",
                params![SELECTION_STATE_KEY, payload_json],
            )
            .map_err(|error| error.to_string())?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use safepath_core::{PersistedSelectionStateDto, WorkflowPhase};
    use uuid::Uuid;

    use crate::Store;

    #[test]
    fn saves_and_loads_selection_state() {
        let db_path = PathBuf::from(format!(
            "{}/safepath-store-selection-{}.sqlite3",
            std::env::temp_dir().display(),
            Uuid::new_v4()
        ));
        let store = Store::new(&db_path).expect("store");
        let selection = PersistedSelectionStateDto {
            source_paths: vec!["/tmp/source".to_string()],
            destination_paths: vec!["/tmp/destination".to_string()],
            workflow_phase: WorkflowPhase::Planning,
            duplicate_config: None,
        };

        store
            .save_selection_state(&selection)
            .expect("save selection state");
        let loaded = store
            .load_selection_state()
            .expect("load selection state")
            .expect("selection state");

        assert_eq!(loaded.source_paths, selection.source_paths);
        assert_eq!(loaded.destination_paths, selection.destination_paths);
        assert_eq!(loaded.workflow_phase, WorkflowPhase::Planning);

        let _ = std::fs::remove_file(db_path);
    }
}
