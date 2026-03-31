use rusqlite::params;
use safepath_core::{ProtectionOverrideDto, ProtectionOverrideKind};
use uuid::Uuid;

use crate::util::{now_epoch_ms, parse_protection_override_kind, protection_override_kind_code};
use crate::Store;

impl Store {
    pub fn set_protection_override(
        &self,
        path: &str,
        override_kind: ProtectionOverrideKind,
    ) -> Result<ProtectionOverrideDto, String> {
        let connection = self.connection()?;
        let override_dto = ProtectionOverrideDto {
            path: path.to_string(),
            override_kind,
        };

        connection
            .execute(
                "DELETE FROM protection_overrides WHERE path = ?1",
                params![path],
            )
            .map_err(|error| error.to_string())?;
        connection
            .execute(
                "INSERT INTO protection_overrides (override_id, path, override_kind, created_at_epoch_ms)
                 VALUES (?1, ?2, ?3, ?4)",
                params![
                    Uuid::new_v4().to_string(),
                    override_dto.path,
                    protection_override_kind_code(override_kind),
                    now_epoch_ms()
                ],
            )
            .map_err(|error| error.to_string())?;

        Ok(override_dto)
    }

    pub fn get_protection_overrides(&self) -> Result<Vec<ProtectionOverrideDto>, String> {
        let connection = self.connection()?;
        let mut statement = connection
            .prepare(
                "SELECT path, override_kind
                 FROM protection_overrides
                 ORDER BY created_at_epoch_ms DESC",
            )
            .map_err(|error| error.to_string())?;

        let overrides = statement
            .query_map([], |row| {
                Ok(ProtectionOverrideDto {
                    path: row.get(0)?,
                    override_kind: parse_protection_override_kind(row.get::<_, String>(1)?),
                })
            })
            .map_err(|error| error.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())?;

        Ok(overrides)
    }
}
