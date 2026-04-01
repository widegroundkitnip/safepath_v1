# Safepath

Safepath is a desktop file-organizing workflow built with Tauri, Rust, React, and SQLite. It scans one or more source folders, analyzes structure and duplicate signals, builds a reviewable organization plan from presets/rules, executes filesystem changes with safety checks, and keeps execution history for best-effort undo.

## What It Does

- Scans source trees and stores manifest rows in SQLite.
- Runs cheap analysis automatically after a scan and optional expensive duplicate hashing on demand.
- Detects likely protected/project-like paths and keeps them visible during review.
- Builds plan actions from built-in presets and destination templates.
- Supports duplicate review with explicit keeper selection.
- Executes same-volume moves, cross-volume safe moves, copy-only review actions, and duplicate holding/trash-hold flows.
- Stores execution history and supports best-effort undo.
- Generates realistic sparse synthetic datasets for scanning and demo/testing workflows.

## Current Maturity

Safepath is early-alpha software. The organizer engine is substantive, but the trust model is still evolving.

- Planning and execution are not transactional.
- Undo is best-effort, not snapshot-based recovery.
- Symlink execution and hashing are intentionally unsupported today.
- Desktop runtime is required for real filesystem work; the browser build is a fallback shell only.

## Repo Layout

- `src/`: React UI and Tauri client wrappers.
- `src-tauri/`: Tauri desktop shell and command handlers.
- `crates/safepath-core/`: planner, analyzer, executor, templates, learner logic, synthetic dataset generation.
- `crates/safepath-store/`: SQLite schema, migrations, and persistence helpers.

## Toolchain

Tested locally with:

- Node `25.8.1`
- npm `11.11.0`
- Rust `1.94.1`
- Cargo `1.94.1`

Pinned repo files:

- `.nvmrc`
- `rust-toolchain.toml`

## Prerequisites

Install:

- Node/npm matching `.nvmrc`
- Rust toolchain matching `rust-toolchain.toml`
- OS dependencies required by Tauri 2 for your platform

On macOS, the usual Xcode command-line tools are required.

## Getting Started

```bash
npm ci
cargo test --workspace
npm run tauri:dev
```

Useful commands:

- `npm run dev`: Vite browser shell only
- `npm run build`: TypeScript compile + Vite build
- `npm run lint`: ESLint
- `npm run test`: frontend smoke tests
- `npm run test:e2e`: browser E2E smoke flow
- `npm run tauri:dev`: desktop app in development
- `npm run tauri:build`: packaged desktop build
- `cargo test --workspace`: Rust unit/integration tests

## Packaged desktop app (installed build)

The release app loads the UI from files inside the bundle (no Vite dev server, no port 1420).

```bash
npm ci
npm run tauri:build
```

On macOS, Tauri writes artifacts under:

- `src-tauri/target/release/bundle/macos/Safepath.app`
- `src-tauri/target/release/bundle/dmg/Safepath_*_aarch64.dmg` (or `x64` on Intel)

Open the `.app` or mount the `.dmg` and drag **Safepath** to **Applications**.

The `tauri:build` script unsets `CI` for the Tauri CLI. Some environments (including IDEs) set `CI=1`, which would otherwise make `tauri build` fail with an invalid `--ci` value. On **Windows** (no `env -u`), run `set CI=` in **cmd** before `npx tauri build`, or use **Git Bash** / **WSL** with the npm script as written.

### Distribution: code signing and notarization (optional)

For **your own machine**, an unsigned local build is usually enough (you may need to allow the app in **System Settings → Privacy & Security** the first time).

To **ship to other Mac users** without Gatekeeper warnings, use an Apple Developer account and:

1. Create a **Developer ID Application** certificate in Keychain.
2. Set **`bundle.macOS.signingIdentity`** in [`src-tauri/tauri.conf.json`](src-tauri/tauri.conf.json) to that identity, or follow Tauri’s guide for **CI** signing (for example importing a certificate via **`APPLE_CERTIFICATE`** so the identity is inferred).
3. Enable **notarization** using the method Tauri documents for your release (Apple ID + app-specific password and/or **API key** variables such as **`APPLE_API_KEY`** / **`APPLE_API_ISSUER`** / **`APPLE_API_KEY_PATH`** on CI).

Environment variable names and steps are defined in the current [Tauri distribution](https://v2.tauri.app/distribute/) documentation; follow that page when you enable signing.

If Cargo cannot write to your global cache in a restricted environment, use a local cargo home:

```bash
CARGO_HOME="$PWD/.cargo-home" cargo test --workspace
```

## Core Workflow

1. Enter one or more absolute source paths.
2. Enter a destination folder.
3. Run readiness check.
4. Start scan.
5. Review cheap analysis, then optionally run expensive analysis.
6. Build a plan from a preset.
7. Approve/reject actions and choose duplicate keepers where required.
8. Execute approved actions.
9. Inspect history and use best-effort undo if needed.

## Synthetic Test Data

The Settings view includes a synthetic dataset generator. It can create messy multi-folder datasets with fake files and sparse large placeholders that report large logical sizes without consuming equivalent disk space.

Use it to:

- generate a realistic scan source quickly
- simulate large-media-heavy libraries
- test duplicate analysis and plan generation

Large synthetic sparse files are tagged through a dataset manifest so expensive hashing can skip them safely during analysis.

## Safety Notes

- Same-volume moves can be checksum-verified.
- Cross-volume moves use copy, verify, then remove.
- Duplicate cleanup moves non-keeper files into Safepath holding folders first.
- Equivalent path inputs are normalized before being stored.
- Duplicate holding destinations are now disambiguated with stable suffixes to avoid basename collisions.

Current limitations:

- Symlink hashing/execution is not supported.
- Plans can go stale if the filesystem changes between scan, review, and execute.
- Recovery after crashes is continuity-oriented, not transactional.

## Testing And CI

CI runs:

- `npm run lint`
- `npm run build`
- `npm run test`
- `cargo test --workspace`

The frontend test layer focuses on smoke coverage for the orchestration UI. Browser E2E coverage is intentionally light and currently targets a happy-path workflow.

## Troubleshooting

- If the app shows the browser fallback, launch through `npm run tauri:dev` instead of plain Vite.
- If readiness fails, verify the destination folder exists and the app has filesystem access to both source and destination paths.
- If duplicate hashing is slow on very large real-world libraries, avoid running expensive analysis until the scan completes and use smaller test sources when iterating.

## Known Gaps

- No transactional recovery journal.
- No desktop-native E2E automation harness yet.
- Accessibility and observability are still limited.
- Multi-destination workflows are not productized even though some storage primitives exist.
