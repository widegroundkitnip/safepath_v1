use crate::types::ManifestEntryDto;

#[derive(Debug, Clone)]
pub struct TemplateRenderResult {
    pub relative_path: String,
    pub tokens_used: Vec<String>,
}

pub fn render_destination_template(
    template: &str,
    entry: &ManifestEntryDto,
) -> Result<TemplateRenderResult, String> {
    validate_template(template)?;
    let mut rendered = String::new();
    let mut tokens_used = Vec::new();
    let mut chars = template.chars().peekable();

    while let Some(ch) = chars.next() {
        if ch != '{' {
            rendered.push(ch);
            continue;
        }

        let mut token = String::new();
        let mut closed = false;
        while let Some(next) = chars.next() {
            if next == '}' {
                closed = true;
                break;
            }
            token.push(next);
        }

        if token.is_empty() {
            return Err("Empty template token.".to_string());
        }
        if !closed {
            return Err("Template token is missing a closing `}`.".to_string());
        }

        tokens_used.push(token.clone());
        rendered.push_str(&token_value(&token, entry)?);
    }

    let relative_path = sanitize_template_path(&rendered);
    if relative_path.is_empty() {
        return Err("Template rendered to an empty destination path.".to_string());
    }

    Ok(TemplateRenderResult {
        relative_path,
        tokens_used,
    })
}

pub fn validate_template(template: &str) -> Result<(), String> {
    if template.trim().is_empty() {
        return Err("Destination template cannot be empty.".to_string());
    }
    if template.starts_with('/') || template.starts_with("~/") {
        return Err(
            "Destination templates must stay relative to the selected destination root."
                .to_string(),
        );
    }
    if template.split('/').any(|segment| segment.trim() == "..") {
        return Err(
            "Destination templates cannot contain parent-directory segments (`..`).".to_string(),
        );
    }

    let mut brace_depth = 0_u32;
    for ch in template.chars() {
        match ch {
            '{' => brace_depth += 1,
            '}' => {
                if brace_depth == 0 {
                    return Err(
                        "Template contains a closing `}` without a matching `{`.".to_string()
                    );
                }
                brace_depth -= 1;
            }
            _ => {}
        }
    }
    if brace_depth != 0 {
        return Err("Template contains an opening `{` without a matching `}`.".to_string());
    }

    Ok(())
}

fn token_value(token: &str, entry: &ManifestEntryDto) -> Result<String, String> {
    match token {
        "filename" | "source_name" => Ok(sanitize_path_segment(
            &entry
                .name
                .rsplit_once('.')
                .map(|(name, _)| name)
                .unwrap_or(&entry.name),
        )),
        "file_extension" => Ok(entry
            .extension
            .clone()
            .unwrap_or_else(|| "unknown".to_string())),
        "file_year" | "year" => Ok(timestamp_segment(entry, 0)),
        "file_month" | "month" => Ok(timestamp_segment(entry, 1)),
        "file_day" | "day" => Ok(timestamp_segment(entry, 2)),
        _ => Err(format!("Unsupported template token `{{{token}}}`.")),
    }
}

fn timestamp_segment(entry: &ManifestEntryDto, index: usize) -> String {
    let timestamp = entry
        .modified_at_epoch_ms
        .or(entry.created_at_epoch_ms)
        .unwrap_or_default();
    if timestamp <= 0 {
        return match index {
            0 => "unknown-year".to_string(),
            1 => "unknown-month".to_string(),
            _ => "unknown-day".to_string(),
        };
    }

    let seconds = timestamp / 1000;
    let days = seconds / 86_400;
    let (year, month, day) = civil_from_days(days);
    match index {
        0 => format!("{year:04}"),
        1 => format!("{month:02}"),
        _ => format!("{day:02}"),
    }
}

fn sanitize_template_path(path: &str) -> String {
    path.split('/')
        .filter(|segment| !segment.trim().is_empty())
        .map(sanitize_path_segment)
        .filter(|segment| !segment.is_empty() && segment != ".")
        .collect::<Vec<_>>()
        .join("/")
}

fn sanitize_path_segment(segment: &str) -> String {
    segment
        .chars()
        .map(|ch| match ch {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => ch,
        })
        .collect::<String>()
        .trim()
        .to_string()
}

fn civil_from_days(days_since_unix_epoch: i64) -> (i32, u32, u32) {
    let z = days_since_unix_epoch + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = mp + if mp < 10 { 3 } else { -9 };
    let year = y + if m <= 2 { 1 } else { 0 };
    (year as i32, m as u32, d as u32)
}

#[cfg(test)]
mod tests {
    use super::{render_destination_template, validate_template};
    use crate::types::{ManifestEntryDto, ManifestEntryKind};

    #[test]
    fn rejects_invalid_templates() {
        assert!(validate_template("../outside").is_err());
        assert!(validate_template("Images/{file_year").is_err());
    }

    #[test]
    fn renders_relative_path_and_tracks_tokens() {
        let entry = ManifestEntryDto {
            entry_id: "entry-1".to_string(),
            job_id: "job".to_string(),
            source_root: "/source".to_string(),
            path: "/source/photo.jpg".to_string(),
            relative_path: "photo.jpg".to_string(),
            name: "photo.jpg".to_string(),
            entry_kind: ManifestEntryKind::File,
            size_bytes: 42,
            extension: Some("jpg".to_string()),
            is_hidden: false,
            created_at_epoch_ms: Some(1_704_067_200_000),
            modified_at_epoch_ms: Some(1_704_067_200_000),
        };

        let rendered =
            render_destination_template("Images/{file_year}/{file_month}", &entry).expect("render");

        assert_eq!(rendered.relative_path, "Images/2024/01");
        assert_eq!(rendered.tokens_used, vec!["file_year", "file_month"]);
    }
}
