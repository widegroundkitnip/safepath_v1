use safepath_core::{GenerateSyntheticDatasetRequest, GenerateSyntheticDatasetResultDto};

#[tauri::command]
pub fn generate_synthetic_dataset(
    request: GenerateSyntheticDatasetRequest,
) -> Result<GenerateSyntheticDatasetResultDto, String> {
    safepath_core::test_data::generate_synthetic_dataset(&request)
}
