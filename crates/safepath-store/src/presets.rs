use rusqlite::{params, OptionalExtension};
use safepath_core::PresetDefinitionDto;

use crate::Store;

impl Store {
    pub fn upsert_presets(&self, presets: &[PresetDefinitionDto]) -> Result<(), String> {
        let connection = self.connection()?;
        for preset in presets {
            let payload_json = serde_json::to_string(preset).map_err(|error| error.to_string())?;
            connection
                .execute(
                    "INSERT INTO presets (preset_id, name, payload_json)
                     VALUES (?1, ?2, ?3)
                     ON CONFLICT(preset_id) DO UPDATE SET
                        name = excluded.name,
                        payload_json = excluded.payload_json",
                    params![preset.preset_id, preset.name, payload_json],
                )
                .map_err(|error| error.to_string())?;
        }
        Ok(())
    }

    pub fn list_presets(&self) -> Result<Vec<PresetDefinitionDto>, String> {
        let connection = self.connection()?;
        let mut statement = connection
            .prepare("SELECT payload_json FROM presets ORDER BY name ASC")
            .map_err(|error| error.to_string())?;
        let rows = statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|error| error.to_string())?;
        rows.map(|row| {
            row.map_err(|error| error.to_string()).and_then(|json| {
                serde_json::from_str::<PresetDefinitionDto>(&json)
                    .map_err(|error| error.to_string())
            })
        })
        .collect::<Result<Vec<_>, _>>()
    }

    pub fn get_preset(&self, preset_id: &str) -> Result<Option<PresetDefinitionDto>, String> {
        let connection = self.connection()?;
        let payload = connection
            .query_row(
                "SELECT payload_json FROM presets WHERE preset_id = ?1",
                params![preset_id],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(|error| error.to_string())?;

        payload
            .map(|json| {
                serde_json::from_str::<PresetDefinitionDto>(&json)
                    .map_err(|error| error.to_string())
            })
            .transpose()
    }
}
