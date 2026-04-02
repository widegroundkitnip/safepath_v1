use crate::types::ManifestEntryDto;

#[derive(Debug, Clone)]
pub struct TemplateRenderResult {
    pub relative_path: String,
    pub tokens_used: Vec<String>,
    pub controls_filename: bool,
    pub allows_collision_disambiguation: bool,
}

#[derive(Debug, Clone, Copy)]
enum TemplateToken {
    FilenameStem,
    OriginalName,
    CollisionName,
    FileExtension,
    FileYear,
    FileMonth,
    FileDay,
    FileDate,
    MediaYear,
    MediaMonth,
    MediaDay,
    MediaDate,
}

#[derive(Debug, Clone)]
struct ResolvedTokenValue {
    value: String,
    is_missing: bool,
    controls_filename: bool,
    allows_collision_disambiguation: bool,
}

pub fn render_destination_template(
    template: &str,
    entry: &ManifestEntryDto,
) -> Result<TemplateRenderResult, String> {
    validate_template(template)?;
    let mut rendered = String::new();
    let mut tokens_used = Vec::new();
    let mut controls_filename = false;
    let mut allows_collision_disambiguation = false;
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
        let resolved = token_value(&token, entry)?;
        controls_filename |= resolved.controls_filename;
        allows_collision_disambiguation |= resolved.allows_collision_disambiguation;
        rendered.push_str(&resolved.value);
    }

    let relative_path = sanitize_template_path(&rendered);
    if relative_path.is_empty() {
        return Err("Template rendered to an empty destination path.".to_string());
    }

    Ok(TemplateRenderResult {
        relative_path,
        tokens_used,
        controls_filename,
        allows_collision_disambiguation,
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

    let segments = template.split('/').collect::<Vec<_>>();
    let last_segment_index = segments.len().saturating_sub(1);
    for (segment_index, segment) in segments.iter().enumerate() {
        for token in extract_tokens(segment)? {
            let parsed_tokens = parse_tokens_for_validation(&token)?;
            if parsed_tokens.iter().copied().any(controls_filename)
                && segment_index != last_segment_index
            {
                return Err(format!(
                    "Template token `{{{token}}}` may only appear in the last path segment."
                ));
            }
        }
    }

    Ok(())
}

fn token_value(token: &str, entry: &ManifestEntryDto) -> Result<ResolvedTokenValue, String> {
    if let Some(fallback_tokens) = token.strip_prefix("fallback:") {
        let candidates = fallback_tokens
            .split(',')
            .map(str::trim)
            .filter(|candidate| !candidate.is_empty())
            .map(parse_token)
            .collect::<Result<Vec<_>, _>>()?;
        if candidates.len() < 2 || candidates.len() > 3 {
            return Err(
                "Fallback tokens must list two or three candidate tokens, e.g. `{fallback:media_year,file_year}`."
                    .to_string(),
            );
        }
        if candidates
            .iter()
            .any(|candidate| controls_filename(*candidate))
        {
            return Err(
                "Fallback tokens cannot wrap filename-control tokens such as `{collision_name}`."
                    .to_string(),
            );
        }

        let mut last_missing = None;
        for candidate in candidates {
            let resolved = resolve_atomic_token(candidate, entry);
            if !resolved.is_missing {
                return Ok(resolved);
            }
            last_missing = Some(resolved);
        }

        return Ok(last_missing.unwrap_or_else(|| ResolvedTokenValue {
            value: "unknown".to_string(),
            is_missing: true,
            controls_filename: false,
            allows_collision_disambiguation: false,
        }));
    }

    Ok(resolve_atomic_token(parse_token(token)?, entry))
}

fn parse_tokens_for_validation(token: &str) -> Result<Vec<TemplateToken>, String> {
    if let Some(fallback_tokens) = token.strip_prefix("fallback:") {
        let candidates = fallback_tokens
            .split(',')
            .map(str::trim)
            .filter(|candidate| !candidate.is_empty())
            .map(parse_token)
            .collect::<Result<Vec<_>, _>>()?;
        if candidates.len() < 2 || candidates.len() > 3 {
            return Err(
                "Fallback tokens must list two or three candidate tokens, e.g. `{fallback:media_year,file_year}`."
                    .to_string(),
            );
        }
        if candidates
            .iter()
            .any(|candidate| controls_filename(*candidate))
        {
            return Err(
                "Fallback tokens cannot wrap filename-control tokens such as `{collision_name}`."
                    .to_string(),
            );
        }
        Ok(candidates)
    } else {
        Ok(vec![parse_token(token)?])
    }
}

fn parse_token(token: &str) -> Result<TemplateToken, String> {
    match token {
        "filename" | "source_name" => Ok(TemplateToken::FilenameStem),
        "original_name" => Ok(TemplateToken::OriginalName),
        "collision_name" => Ok(TemplateToken::CollisionName),
        "file_extension" => Ok(TemplateToken::FileExtension),
        "file_year" | "year" => Ok(TemplateToken::FileYear),
        "file_month" | "month" => Ok(TemplateToken::FileMonth),
        "file_day" | "day" => Ok(TemplateToken::FileDay),
        "file_date" => Ok(TemplateToken::FileDate),
        "media_year" => Ok(TemplateToken::MediaYear),
        "media_month" => Ok(TemplateToken::MediaMonth),
        "media_day" => Ok(TemplateToken::MediaDay),
        "media_date" => Ok(TemplateToken::MediaDate),
        _ => Err(format!("Unsupported template token `{{{token}}}`.")),
    }
}

fn resolve_atomic_token(token: TemplateToken, entry: &ManifestEntryDto) -> ResolvedTokenValue {
    match token {
        TemplateToken::FilenameStem => ResolvedTokenValue {
            value: sanitize_path_segment(
                entry
                    .name
                    .rsplit_once('.')
                    .map(|(name, _)| name)
                    .unwrap_or(&entry.name),
            ),
            is_missing: entry.name.trim().is_empty(),
            controls_filename: false,
            allows_collision_disambiguation: false,
        },
        TemplateToken::OriginalName => ResolvedTokenValue {
            value: sanitize_path_segment(&entry.name),
            is_missing: entry.name.trim().is_empty(),
            controls_filename: true,
            allows_collision_disambiguation: false,
        },
        TemplateToken::CollisionName => ResolvedTokenValue {
            value: sanitize_path_segment(&entry.name),
            is_missing: entry.name.trim().is_empty(),
            controls_filename: true,
            allows_collision_disambiguation: true,
        },
        TemplateToken::FileExtension => ResolvedTokenValue {
            value: entry
                .extension
                .clone()
                .unwrap_or_else(|| "unknown".to_string()),
            is_missing: entry.extension.is_none(),
            controls_filename: false,
            allows_collision_disambiguation: false,
        },
        TemplateToken::FileYear => timestamp_segment(file_timestamp(entry), 0),
        TemplateToken::FileMonth => timestamp_segment(file_timestamp(entry), 1),
        TemplateToken::FileDay => timestamp_segment(file_timestamp(entry), 2),
        TemplateToken::FileDate => timestamp_segment(file_timestamp(entry), 3),
        TemplateToken::MediaYear => timestamp_segment(entry.media_date_epoch_ms, 0),
        TemplateToken::MediaMonth => timestamp_segment(entry.media_date_epoch_ms, 1),
        TemplateToken::MediaDay => timestamp_segment(entry.media_date_epoch_ms, 2),
        TemplateToken::MediaDate => timestamp_segment(entry.media_date_epoch_ms, 3),
    }
}

fn controls_filename(token: TemplateToken) -> bool {
    matches!(
        token,
        TemplateToken::OriginalName | TemplateToken::CollisionName
    )
}

fn file_timestamp(entry: &ManifestEntryDto) -> Option<i64> {
    entry.modified_at_epoch_ms.or(entry.created_at_epoch_ms)
}

fn extract_tokens(segment: &str) -> Result<Vec<String>, String> {
    let mut tokens = Vec::new();
    let mut chars = segment.chars().peekable();
    while let Some(ch) = chars.next() {
        if ch != '{' {
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
        tokens.push(token);
    }

    Ok(tokens)
}

fn timestamp_segment(timestamp: Option<i64>, index: usize) -> ResolvedTokenValue {
    match timestamp.filter(|value| *value > 0) {
        Some(timestamp) => {
            let seconds = timestamp / 1000;
            let days = seconds / 86_400;
            let (year, month, day) = civil_from_days(days);
            let value = match index {
                0 => format!("{year:04}"),
                1 => format!("{month:02}"),
                2 => format!("{day:02}"),
                _ => format!("{year:04}-{month:02}-{day:02}"),
            };
            ResolvedTokenValue {
                value,
                is_missing: false,
                controls_filename: false,
                allows_collision_disambiguation: false,
            }
        }
        None => {
            let value = match index {
                0 => "unknown-year".to_string(),
                1 => "unknown-month".to_string(),
                2 => "unknown-day".to_string(),
                _ => "unknown-date".to_string(),
            };
            ResolvedTokenValue {
                value,
                is_missing: true,
                controls_filename: false,
                allows_collision_disambiguation: false,
            }
        }
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
        assert!(validate_template("Images/{nope}").is_err());
        assert!(validate_template("{collision_name}/Images").is_err());
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
            media_date_epoch_ms: Some(1_706_745_600_000),
            media_date_source: None,
        };

        let rendered =
            render_destination_template("Images/{file_year}/{file_month}", &entry).expect("render");

        assert_eq!(rendered.relative_path, "Images/2024/01");
        assert_eq!(rendered.tokens_used, vec!["file_year", "file_month"]);
        assert!(!rendered.controls_filename);
        assert!(!rendered.allows_collision_disambiguation);
    }

    #[test]
    fn fallback_prefers_media_date_and_collision_name_controls_filename() {
        let entry = ManifestEntryDto {
            entry_id: "entry-2".to_string(),
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
            media_date_epoch_ms: Some(1_709_337_600_000),
            media_date_source: None,
        };

        let rendered = render_destination_template(
            "Photos/{fallback:media_year,file_year}/{fallback:media_month,file_month}/{collision_name}",
            &entry,
        )
        .expect("render");

        assert_eq!(rendered.relative_path, "Photos/2024/03/photo.jpg");
        assert!(rendered.controls_filename);
        assert!(rendered.allows_collision_disambiguation);
    }
}
