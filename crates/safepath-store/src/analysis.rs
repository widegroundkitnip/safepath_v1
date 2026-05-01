use rusqlite::{params, OptionalExtension};
use safepath_core::{
    AnalysisSummaryDto, BoundaryKind, ProtectionDetectionDto, ProtectionOverrideKind,
    ProtectionState,
};
use uuid::Uuid;

use crate::util::{duplicate_certainty_code, protection_state_code};
use crate::Store;

impl Store {
    pub fn save_analysis_summary(&self, summary: &AnalysisSummaryDto) -> Result<(), String> {
        let connection = self.connection()?;
        let payload_json = serde_json::to_string(summary).map_err(|error| error.to_string())?;

        connection
            .execute(
                "INSERT INTO analysis_results (analysis_id, job_id, analysis_version, payload_json)
                 VALUES (?1, ?2, 1, ?3)
                 ON CONFLICT(job_id) DO UPDATE SET
                    payload_json = excluded.payload_json,
                    analysis_version = analysis_results.analysis_version + 1",
                params![Uuid::new_v4().to_string(), summary.job_id, payload_json],
            )
            .map_err(|error| error.to_string())?;

        connection
            .execute(
                "DELETE FROM duplicate_group_members
                 WHERE group_id IN (SELECT group_id FROM duplicate_groups WHERE job_id = ?1)",
                params![summary.job_id],
            )
            .map_err(|error| error.to_string())?;
        connection
            .execute(
                "DELETE FROM duplicate_groups WHERE job_id = ?1",
                params![summary.job_id],
            )
            .map_err(|error| error.to_string())?;
        connection
            .execute(
                "DELETE FROM detected_protection WHERE job_id = ?1",
                params![summary.job_id],
            )
            .map_err(|error| error.to_string())?;

        for group in &summary.likely_duplicate_groups {
            let group_payload = serde_json::to_string(group).map_err(|error| error.to_string())?;
            connection
                .execute(
                    "INSERT INTO duplicate_groups (group_id, job_id, certainty, payload_json)
                     VALUES (?1, ?2, ?3, ?4)",
                    params![
                        group.group_id,
                        summary.job_id,
                        duplicate_certainty_code(group.certainty),
                        group_payload
                    ],
                )
                .map_err(|error| error.to_string())?;

            for member in &group.members {
                connection
                    .execute(
                        "INSERT INTO duplicate_group_members (group_id, entry_id) VALUES (?1, ?2)",
                        params![group.group_id, member.entry_id],
                    )
                    .map_err(|error| error.to_string())?;
            }
        }

        for detection in &summary.detected_protections {
            let payload = serde_json::to_string(detection).map_err(|error| error.to_string())?;
            connection
                .execute(
                    "INSERT INTO detected_protection (protection_id, job_id, path, state, payload_json)
                     VALUES (?1, ?2, ?3, ?4, ?5)",
                    params![
                        Uuid::new_v4().to_string(),
                        summary.job_id,
                        detection.path,
                        protection_state_code(detection),
                        payload
                    ],
                )
                .map_err(|error| error.to_string())?;
        }

        self.prune_orphaned_expensive_analysis_caches(&summary.job_id)?;

        Ok(())
    }

    pub fn get_analysis_summary(&self, job_id: &str) -> Result<Option<AnalysisSummaryDto>, String> {
        let connection = self.connection()?;
        let payload = connection
            .query_row(
                "SELECT payload_json
                 FROM analysis_results
                 WHERE job_id = ?1
                 ORDER BY analysis_version DESC
                 LIMIT 1",
                params![job_id],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(|error| error.to_string())?;

        match payload {
            Some(json) => {
                let mut summary = serde_json::from_str::<AnalysisSummaryDto>(&json)
                    .map_err(|error| error.to_string())?;
                let overrides = self.get_protection_overrides()?;
                summary.protection_overrides = overrides.clone();

                for override_item in overrides {
                    let boundary_kind = match override_item.override_kind {
                        ProtectionOverrideKind::UserProtected
                        | ProtectionOverrideKind::ProjectRoot => BoundaryKind::ProjectRoot,
                        ProtectionOverrideKind::ParentFolder => BoundaryKind::ParentFolder,
                        ProtectionOverrideKind::PreserveBoundary => BoundaryKind::PreserveBoundary,
                        ProtectionOverrideKind::Independent => BoundaryKind::Independent,
                    };

                    let merged_detection = ProtectionDetectionDto {
                        path: override_item.path.clone(),
                        state: ProtectionState::UserProtected,
                        boundary_kind,
                        confidence: Some(1.0),
                        markers: vec!["user_override".to_string()],
                        reasons: vec![
                            "The user explicitly marked this path as protected.".to_string()
                        ],
                    };

                    if let Some(existing) = summary
                        .detected_protections
                        .iter_mut()
                        .find(|detection| detection.path == override_item.path)
                    {
                        *existing = merged_detection;
                    } else {
                        summary.detected_protections.push(merged_detection);
                    }
                }

                Ok(Some(summary))
            }
            None => Ok(None),
        }
    }
}
