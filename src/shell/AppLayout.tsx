import type { ReactNode } from 'react'
import { Bookmark, ClipboardCheck, History, Home, Settings } from 'lucide-react'

export type AppNavId = 'workflow' | 'review' | 'history' | 'presets' | 'settings'

type AppLayoutProps = {
  children: ReactNode
  activeNav: AppNavId
  onNav: (id: AppNavId) => void
  canOpenReview: boolean
  phaseLabel: string
  showStartOver: boolean
  onStartOver: () => void
  uiMode: 'simple' | 'advanced'
  onToggleUiMode: () => void
  error: string | null
  desktopAvailable: boolean
}

const navItems: { id: AppNavId; label: string; icon: typeof Home }[] = [
  { id: 'workflow', label: 'Home', icon: Home },
  { id: 'review', label: 'Review', icon: ClipboardCheck },
  { id: 'history', label: 'History', icon: History },
  { id: 'presets', label: 'Presets', icon: Bookmark },
  { id: 'settings', label: 'Settings', icon: Settings },
]

export function AppLayout({
  children,
  activeNav,
  onNav,
  canOpenReview,
  phaseLabel,
  showStartOver,
  onStartOver,
  uiMode,
  onToggleUiMode,
  error,
  desktopAvailable,
}: AppLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-purple-950 via-purple-900 to-slate-950 text-white">
      <a
        href="#app-main-content"
        className="fixed left-4 top-4 z-[100] -translate-y-[200%] rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white shadow-lg outline-none transition-transform focus:translate-y-0 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-violet-300"
      >
        Skip to main content
      </a>
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside
          className="flex w-56 shrink-0 flex-col border-r border-white/10 bg-black/25 py-6 backdrop-blur-md"
          aria-label="Main navigation"
        >
          <div className="mb-6 flex items-center gap-2 px-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-400 to-blue-500 shadow-lg shadow-violet-500/30">
              <span className="text-lg font-bold text-white">S</span>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-white/50">Safepath</p>
              <p className="text-sm text-white/80">Organize safely</p>
            </div>
          </div>
          <nav className="flex flex-1 flex-col gap-1 px-2">
            {navItems.map(({ id, label, icon: Icon }) => {
              const disabled = id === 'review' && !canOpenReview
              const active = activeNav === id
              return (
                <button
                  key={id}
                  type="button"
                  disabled={disabled}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => onNav(id)}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400 disabled:cursor-not-allowed disabled:opacity-40 ${
                    active
                      ? 'bg-white/15 text-white'
                      : 'text-white/60 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <Icon className="h-5 w-5 shrink-0 opacity-80" aria-hidden />
                  {label}
                </button>
              )
            })}
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 bg-black/20 px-6 backdrop-blur-md">
            <div className="flex min-w-0 items-center gap-4">
              <h1 className="truncate text-lg font-semibold tracking-tight">Safepath</h1>
              <span
                className="hidden max-w-[220px] truncate rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/70 sm:inline-block"
                title={phaseLabel}
              >
                {phaseLabel}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {!desktopAvailable ? (
                <span className="rounded-full bg-amber-500/20 px-3 py-1 text-xs text-amber-200">
                  Browser shell — filesystem limited
                </span>
              ) : null}
              {showStartOver ? (
                <button
                  type="button"
                  onClick={onStartOver}
                  className="rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-sm text-white/80 transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400"
                >
                  Start over
                </button>
              ) : null}
              <button
                type="button"
                onClick={onToggleUiMode}
                className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white transition-colors hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400"
              >
                {uiMode === 'simple' ? 'Simple' : 'Advanced'} mode
              </button>
            </div>
          </header>

          {error ? (
            <div
              className="shrink-0 border-b border-red-400/40 bg-red-950/80 px-6 py-3 text-sm text-red-100"
              role="alert"
              aria-live="assertive"
              aria-atomic="true"
              data-testid="app-error-banner"
            >
              {error}
            </div>
          ) : null}

          <main
            id="app-main-content"
            tabIndex={-1}
            className="min-h-0 flex-1 overflow-y-auto p-6 md:p-10 outline-none"
          >
            <p id="app-phase-announcement" className="sr-only" aria-live="polite" aria-atomic="true">
              {phaseLabel}
            </p>
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}
