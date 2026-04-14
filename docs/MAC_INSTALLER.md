# Build a macOS installer (Safepath)

Safepath is a **Tauri** app. On a Mac, `tauri build` produces:

- **`Safepath_0.1.0_aarch64.dmg`** (Apple Silicon) or **`Safepath_0.1.0_x64.dmg`** (Intel) — drag-to-install disk image  
- **`Safepath.app`** — the application bundle (inside the DMG and also under `bundle/macos/`)

## Requirements

- **macOS 12+** (matches `minimumSystemVersion` in `src-tauri/tauri.conf.json`)
- **Node.js** from [`.nvmrc`](../.nvmrc) and **Rust** from [`rust-toolchain.toml`](../rust-toolchain.toml)
- **Xcode Command Line Tools** (`xcode-select --install`)
- [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for macOS

## Build the DMG (one command)

From the repo root:

```bash
npm ci          # first time, or after lockfile changes
npm run tauri:build
```

When it finishes, open the DMG folder:

```bash
open src-tauri/target/release/bundle/dmg/
```

Double-click **`Safepath_*_*.dmg`**, drag **Safepath** into **Applications**, then eject the disk image.

Or run the app directly without the DMG:

```bash
open src-tauri/target/release/bundle/macos/Safepath.app
```

## Apple Gatekeeper (unsigned / ad-hoc builds)

Local `tauri build` output is usually **not** notarized. The first time you open the app, macOS may block it.

- **Right-click** Safepath → **Open** → confirm **Open**, or  
- **System Settings → Privacy & Security** → allow the app when prompted.

For distribution outside your machine you would add **code signing** and **notarization** (Apple Developer Program). That is not covered here.

## Architecture

- Build on **Apple Silicon (M1/M2/M3/…)**: DMG is typically **`aarch64`**.  
- Build on **Intel Mac**: DMG is typically **`x64`**.

To ship a **universal** binary you need a more involved Rust/Tauri setup; the default single-arch build is enough for “install on my Mac” when you build on that Mac.

## Helper script

From the repo root:

```bash
chmod +x scripts/build-mac-installer.sh
./scripts/build-mac-installer.sh
```

It runs the same build and prints the paths to `.app` and `.dmg`.
