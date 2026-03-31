import type { PermissionReadinessDto } from '../../types/app'

const stateLabel: Record<PermissionReadinessDto['state'], string> = {
  unknown: 'Unknown',
  ready: 'Ready',
  needsAttention: 'Needs attention',
}

interface PermissionReadinessCardProps {
  readiness: PermissionReadinessDto
}

export function PermissionReadinessCard({ readiness }: PermissionReadinessCardProps) {
  return (
    <section className="status-card">
      <header className="status-card__header">
        <div>
          <p className="status-card__eyebrow">Permissions readiness</p>
          <h3>{stateLabel[readiness.state]}</h3>
        </div>
        <span className={`status-pill status-pill--${readiness.state}`}>
          {stateLabel[readiness.state]}
        </span>
      </header>

      <p className="status-card__summary">{readiness.summary}</p>

      <ul className="status-card__list">
        {readiness.details.map((detail) => (
          <li key={detail}>{detail}</li>
        ))}
      </ul>
    </section>
  )
}
