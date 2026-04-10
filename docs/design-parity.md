# Design parity (mockup reference)

The shadcn-style mockup under `temp ref/Design app mockup/` (see `temp ref/Design app mockup/src/styles/theme.css`, `--radius: 0.625rem`) informs legacy workflow chrome spacing tokens.

In the main app, shared panels (`.column-panel`, `.status-card`, `.empty-card`) use **0.625rem** corner radius so cards match that reference instead of the older 18px default.

The three-column **workflow** layout is expressed with Tailwind on `WorkflowShell` (`grid`, `gap-4`, `minmax` column tracks); column-specific rules remain in `App.css` (for example `.workflow-shell__column { min-width: 0 }`).
