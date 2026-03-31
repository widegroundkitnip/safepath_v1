import type { AppStatusDto } from '../../types/app'

interface AppStatusSummaryProps {
  status: AppStatusDto
}

export function AppStatusSummary({ status }: AppStatusSummaryProps) {
  return (
    <section className="status-card">
      <header className="status-card__header">
        <div>
          <p className="status-card__eyebrow">Desktop bridge</p>
          <h3>{status.appName}</h3>
        </div>
        <span className="status-pill status-pill--neutral">{status.workflowPhase}</span>
      </header>

      <dl className="status-grid">
        <div>
          <dt>Version</dt>
          <dd>{status.appVersion}</dd>
        </div>
        <div>
          <dt>Platform</dt>
          <dd>{status.platform}</dd>
        </div>
        <div>
          <dt>Sources selected</dt>
          <dd>{status.hasSources ? status.sourcePaths.length : 'Not yet'}</dd>
        </div>
        <div>
          <dt>Destinations selected</dt>
          <dd>{status.hasDestinations ? status.destinationPaths.length : 'Not yet'}</dd>
        </div>
      </dl>
    </section>
  )
}
