use std::time::{SystemTime, UNIX_EPOCH};

use safepath_core::{
    ActionRecordStatus, DuplicateCertainty, ExecutionOperationKind, ManifestEntryKind,
    ProtectionDetectionDto, ProtectionOverrideKind, ScanJobState,
};

pub(crate) fn now_epoch_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

pub(crate) fn scan_state_code(state: ScanJobState) -> &'static str {
    match state {
        ScanJobState::Pending => "pending",
        ScanJobState::Running => "running",
        ScanJobState::Completed => "completed",
        ScanJobState::Failed => "failed",
        ScanJobState::Cancelled => "cancelled",
    }
}

pub(crate) fn parse_scan_state(value: String) -> ScanJobState {
    match value.as_str() {
        "pending" => ScanJobState::Pending,
        "running" => ScanJobState::Running,
        "completed" => ScanJobState::Completed,
        "failed" => ScanJobState::Failed,
        "cancelled" => ScanJobState::Cancelled,
        _ => ScanJobState::Failed,
    }
}

pub(crate) fn manifest_entry_kind_code(kind: ManifestEntryKind) -> &'static str {
    match kind {
        ManifestEntryKind::File => "file",
        ManifestEntryKind::Directory => "directory",
    }
}

pub(crate) fn parse_manifest_entry_kind(value: String) -> ManifestEntryKind {
    match value.as_str() {
        "directory" => ManifestEntryKind::Directory,
        _ => ManifestEntryKind::File,
    }
}

pub(crate) fn protection_override_kind_code(kind: ProtectionOverrideKind) -> &'static str {
    match kind {
        ProtectionOverrideKind::UserProtected => "userProtected",
        ProtectionOverrideKind::ProjectRoot => "projectRoot",
        ProtectionOverrideKind::ParentFolder => "parentFolder",
        ProtectionOverrideKind::PreserveBoundary => "preserveBoundary",
        ProtectionOverrideKind::Independent => "independent",
    }
}

pub(crate) fn parse_protection_override_kind(value: String) -> ProtectionOverrideKind {
    match value.as_str() {
        "projectRoot" => ProtectionOverrideKind::ProjectRoot,
        "parentFolder" => ProtectionOverrideKind::ParentFolder,
        "preserveBoundary" => ProtectionOverrideKind::PreserveBoundary,
        "independent" => ProtectionOverrideKind::Independent,
        _ => ProtectionOverrideKind::UserProtected,
    }
}

pub(crate) fn protection_state_code(detection: &ProtectionDetectionDto) -> &'static str {
    match detection.state {
        safepath_core::ProtectionState::UserProtected => "userProtected",
        safepath_core::ProtectionState::AutoDetectedHigh => "autoDetectedHigh",
        safepath_core::ProtectionState::AutoDetectedMedium => "autoDetectedMedium",
        safepath_core::ProtectionState::AutoDetectedLow => "autoDetectedLow",
        safepath_core::ProtectionState::Unprotected => "unprotected",
    }
}

pub(crate) fn execution_operation_kind_code(kind: ExecutionOperationKind) -> &'static str {
    match kind {
        ExecutionOperationKind::Execute => "execute",
        ExecutionOperationKind::Undo => "undo",
    }
}

pub(crate) fn action_record_status_code(status: ActionRecordStatus) -> &'static str {
    match status {
        ActionRecordStatus::Completed => "completed",
        ActionRecordStatus::Failed => "failed",
        ActionRecordStatus::Skipped => "skipped",
    }
}

pub(crate) fn duplicate_certainty_code(certainty: DuplicateCertainty) -> &'static str {
    match certainty {
        DuplicateCertainty::Definite => "definite",
        DuplicateCertainty::Likely => "likely",
        DuplicateCertainty::Possible => "possible",
    }
}
