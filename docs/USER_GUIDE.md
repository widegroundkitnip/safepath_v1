# Safepath User Guide

Safepath is a desktop-first, local-first file organizer. It helps you scan one or more folders, build a reviewable plan, and execute approved file moves with safety checks and history.

This guide explains the product language behind that workflow so the app feels predictable before you move anything.

## Core flow

Safepath works in clear phases:

1. Select one or more source folders and a destination root.
2. Confirm source and destination folders.
3. Start a scan.
4. Review analysis signals, protections, and duplicate groups.
5. Build a plan from a built-in preset.
6. Approve, reject, or reset actions. Choose duplicate keepers where required.
7. Review execution checks.
8. Execute approved actions.
9. Inspect history and use best-effort undo where available.

Safepath is intentionally guided. It is not designed to silently reorganize a whole disk without review.

## How the app maps to these steps

The desktop shell uses **Home**, **Review**, **History**, **Presets**, and **Settings**. The numbered flow above lines up with Home and Review like this:

| Guide steps | What you are doing | Where it shows up |
|-------------|--------------------|-------------------|
| 1–3 | Pick sources and destination, confirm folder access, start a scan | **Home** — setup, then the scanning screen while the job runs |
| 4 | Review analysis signals (duplicates, protections, clutter hints) | **Home** — “scan complete” results before a plan exists |
| 5–7 | Build a plan from a preset, approve or reject actions, pick duplicate keepers, read execution checks | **Home** — after you continue into the plan workspace, or **Review** — same workspace once a plan exists |
| 8 | Execute approved moves | **Home** or **Review** — execution progress replaces the workspace while a run is active |
| 9 | Inspect history and use undo when available | **History** |

**Presets** is a dedicated place to read preset descriptions and sync your chosen preset with Home. **Settings** now uses focused tabs (Mock data, AI, Learner, Observations) so each group only shows controls relevant to that area.

**Simple** and **Advanced** mode use the same stages. In **Simple**, technical panels stay **fully hidden** until you switch to **Advanced** — including deep duplicate hashing on the results screen, manifest paging, raw scan job and session IDs in the UI, per-category breakdown tables, and action/duplicate debug lines. **Advanced** shows the full review surfaces and technical readouts described in this guide.

On **Home** in **Simple** mode, folder setup stays focused: add at least one source and one destination (manually or with **Browse**), then start the scan. The old readiness checklist and technical permission panel are no longer part of the primary setup step.

On **Home** in **Simple** mode, a **step card** under the progress strip spells out where you are (for example “Step 1 of 6 · Prepare”) and one line of what to do next, using the same six stages as the strip.

**Review** is a **shortcut** to the plan workspace once you have a plan — the same steps still run on **Home**; Review does not replace that path.

On **Home** (and on **Review** when it applies), a compact **progress strip** under the main heading mirrors the same six stages: Prepare → Scan → Signals → Plan & review → Execute → Complete. It stays in sync with the phase label in the app header.

## What a plan means

A plan is Safepath's best current proposal for what should happen to the files it scanned.

It is not a reservation or lock on the filesystem. If files change after scan or review, the plan can become stale.

## What "stale plan" means

A stale plan means the filesystem changed after Safepath scanned it or after you reviewed it.

Examples:

- a source file was renamed or deleted outside Safepath
- a file changed size or modified time after scan
- a destination path that used to be free now exists

Safepath treats this as a trust issue, not a background detail. That is why the app surfaces execution checks before running a plan and again right before execution starts.

If a stale-plan warning appears, review the affected action and rebuild the plan if the underlying file change matters.

## What execution checks mean

Execution checks are the last guardrail before Safepath touches the filesystem.

They can include:

- missing source paths
- destination collisions
- duplicate groups that still need a keeper
- warnings that a file changed since scan

Warnings do not automatically block execution. Errors do.

## Duplicate review terms

### Keeper

The keeper is the file you want to preserve as the primary copy within a duplicate group.

### Holding

Safepath holding paths are Safepath-managed destinations used during duplicate cleanup. They let the app move a non-keeper out of the main library before a harder cleanup decision is final.

### Trash holding

Safepath trash holding is the app-managed area used by duplicate-review flows that move non-keepers into a dedicated Safepath trash location instead of deleting them outright.

Safepath uses holding and trash-hold language to emphasize that duplicate cleanup is safety-oriented, not instant hard deletion.

## What undo means

Undo in Safepath is best-effort.

That means Safepath can attempt to reverse some completed actions when it still has enough trustworthy history and the required destination or holding paths still exist.

Undo is not:

- a snapshot restore system
- a transactional filesystem rollback
- a guarantee that every completed action can be reversed later

If an action is shown as undo-ready, Safepath believes it still has enough information to try. If it is unavailable, the history view explains why.

## Protection-aware planning

Safepath detects paths that look like project or structured roots, such as folders with `.git`, `package.json`, or `Cargo.toml`.

Protection-aware planning means those areas stay visible in review and may be blocked or handled more conservatively depending on the preset.

This is one of the main ways Safepath stays safety-first instead of behaving like a blind batch sorter.

## Presets

Safepath presets are opinionated built-in planning modes. They are meant to cover common inboxes without forcing users into raw JSON or custom rule authoring first.

Choose a preset based on what you are organizing:

- general organization for mixed everyday folders
- project-safe organization when source folders may include code or app roots
- duplicate review when your main job is resolving keepers
- curated specialty presets for common inboxes such as downloads, screenshots, or camera imports

If a preset description says it is not ideal for a certain kind of folder, treat that as a real safety boundary.

## Browser fallback vs desktop app

The browser fallback can render the interface, but real scanning, execution, undo, and persisted history require the Tauri desktop runtime.

If you see the fallback shell, launch Safepath through the desktop app for real filesystem work.
