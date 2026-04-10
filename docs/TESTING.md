# How to test Safepath on your computer

This guide walks through running automated checks and doing quick manual smoke tests locally. All commands assume your terminal’s current directory is the repo root (`File-organizerv2/`).

## 1. Prerequisites

- **Node.js** matching [`.nvmrc`](../.nvmrc) (e.g. `nvm use` if you use nvm).
- **npm** (comes with Node).
- **Rust** matching [`rust-toolchain.toml`](../rust-toolchain.toml) (Cargo will install the pinned toolchain on first use).
- On **macOS**: Xcode Command Line Tools (for Rust and Tauri).
- For **desktop builds**: [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS.

Install JavaScript dependencies once (or after `package-lock.json` changes):

```bash
npm ci
```

## 2. Frontend unit tests (Vitest)

Runs React/unit tests in Node (jsdom):

```bash
npm test -- --run
```

- Watch mode during development: `npm test` (no `--run`).
- Coverage report: `npm run test:coverage`.

## 3. Browser E2E tests (Playwright)

E2E tests start a **Vite dev server** with **`VITE_E2E_MOCK=true`**, which stubs Tauri so flows work without the real desktop backend. They use Chromium and store browsers under **`.playwright/`** in the repo.

**First time only** — install Chromium for Playwright:

```bash
npm run test:e2e:install
```

**Run the suite:**

```bash
npm run test:e2e
```

Notes:

- Playwright is configured to use `PLAYWRIGHT_BROWSERS_PATH=.playwright` (see [`package.json`](../package.json)).
- If a dev server is already running on `127.0.0.1:4173`, Playwright may reuse it (non-CI behavior).
- To run a single file:  
  `PLAYWRIGHT_BROWSERS_PATH=.playwright npx playwright test tests/e2e/app-shell.spec.ts`

## 4. Lint and production build

Useful before pushing or when CI fails:

```bash
npm run lint
npm run build
```

`build` runs TypeScript project references and Vite production build.

## 5. Rust tests

From the repo root:

```bash
cargo test --workspace
```

This exercises planner, store, and other crates under `crates/`.

## 6. Manual testing in the browser (UI only)

The **browser shell** does not talk to the real Tauri filesystem APIs; it is still useful for layout, navigation, and mocked E2E parity.

```bash
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`). Expect limited behavior compared to the desktop app.

To exercise **mocked** backend behavior in the browser without Playwright, you can run dev with the mock flag (same as E2E):

```bash
VITE_E2E_MOCK=true npm run dev
```

## 7. Manual testing in the desktop app

Full integration with SQLite, scanning, and execution:

```bash
npm run tauri:dev
```

Use this path when validating real folders, permissions, and execution—not only UI.

## 8. Quick “everything local” checklist

Run these in order when you want broad confidence:

```bash
npm ci
npm run lint
npm run build
npm test -- --run
npm run test:e2e:install   # first time only
npm run test:e2e
cargo test --workspace
```

CI runs an equivalent frontend pipeline (see [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)); matching it locally reduces surprise failures.

## 9. If something fails

| Symptom | Things to try |
|--------|----------------|
| Playwright “Executable doesn’t exist” | Run `npm run test:e2e:install` from the repo root. |
| Port `4173` in use | Stop other processes on that port, or unset `reuseExistingServer` behavior by not leaving a stray dev server running. |
| Rust compile errors | `rustup show` / ensure `rust-toolchain.toml` toolchain is active; `cargo clean` rarely needed. |
| `npm ci` fails | Use the Node version in `.nvmrc`; delete `node_modules` and retry. |

For product behavior and trust boundaries, see [`USER_GUIDE.md`](USER_GUIDE.md).
