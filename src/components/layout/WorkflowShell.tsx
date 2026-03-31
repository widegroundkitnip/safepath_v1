import type { PropsWithChildren, ReactNode } from 'react'

interface ColumnProps extends PropsWithChildren {
  title: string
  subtitle: string
  aside?: ReactNode
}

function ColumnPanel({ title, subtitle, aside, children }: ColumnProps) {
  return (
    <section className="column-panel">
      <header className="column-panel__header">
        <div>
          <p className="column-panel__eyebrow">{title}</p>
          <h2>{subtitle}</h2>
        </div>
        {aside}
      </header>
      <div className="column-panel__body">{children}</div>
    </section>
  )
}

interface WorkflowShellProps {
  centerHeader?: ReactNode
  left: ReactNode
  center: ReactNode
  right: ReactNode
}

export function WorkflowShell({ centerHeader, left, center, right }: WorkflowShellProps) {
  return (
    <main className="workflow-shell">
      <aside className="workflow-shell__column workflow-shell__column--side">
        <ColumnPanel title="Sources" subtitle="What to scan">
          {left}
        </ColumnPanel>
      </aside>

      <section className="workflow-shell__column workflow-shell__column--center">
        <ColumnPanel title="Plan / Queue" subtitle="What Safepath will do" aside={centerHeader}>
          {center}
        </ColumnPanel>
      </section>

      <aside className="workflow-shell__column workflow-shell__column--side">
        <ColumnPanel title="Destinations" subtitle="Where outputs will go">
          {right}
        </ColumnPanel>
      </aside>
    </main>
  )
}
