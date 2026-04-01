import type { ExecutionSessionDto, HistoryEntryDto, HistoryPageDto } from '../../types/app'
import { formatExecutionStrategy, formatTimestamp } from '../app/shared'

interface PaginatedSlice<T> {
  items: T[]
  page: number
  totalItems: number
  totalPages: number
  rangeStart: number
  rangeEnd: number
}

interface HistoryViewProps {
  historyPage: HistoryPageDto | null
  historyPageIndex: number
  isLoadingHistory: boolean
  selectedHistoryRecord: HistoryEntryDto | null
  selectedHistorySession: ExecutionSessionDto | null
  historySessionRecordPage: PaginatedSlice<ExecutionSessionDto['records'][number]>
  isUndoingHistory: boolean
  onPreviousHistoryPage: () => void
  onNextHistoryPage: () => void
  onSelectHistoryEntry: (entry: HistoryEntryDto) => void
  onUndoSelectedRecord: () => void
  onUndoSelectedSession: () => void
  onPreviousHistorySessionRecordPage: () => void
  onNextHistorySessionRecordPage: () => void
}

export function HistoryView({
  historyPage,
  historyPageIndex,
  isLoadingHistory,
  selectedHistoryRecord,
  selectedHistorySession,
  historySessionRecordPage,
  isUndoingHistory,
  onPreviousHistoryPage,
  onNextHistoryPage,
  onSelectHistoryEntry,
  onUndoSelectedRecord,
  onUndoSelectedSession,
  onPreviousHistorySessionRecordPage,
  onNextHistorySessionRecordPage,
}: HistoryViewProps) {
  return (
    <section className="history-shell">
      <div className="status-card">
        <header className="status-card__header">
          <div>
            <p className="status-card__eyebrow">Execution history</p>
            <h3>{historyPage?.totalEntries ?? 0} recorded actions</h3>
          </div>
          <span className="status-pill status-pill--neutral">
            Page {(historyPage?.page ?? historyPageIndex) + 1}
            {historyPage && historyPage.totalPages > 0 ? ` / ${historyPage.totalPages}` : ''}
          </span>
        </header>
        <p className="status-card__summary">
          Inspect past execution records, open their sessions, and see core-owned undo readiness
          without re-parsing stored JSON in the frontend.
        </p>
        {historyPage?.entries.length ? (
          <p className="status-card__summary">
            Showing {historyPage.page * historyPage.pageSize + 1}-
            {historyPage.page * historyPage.pageSize + historyPage.entries.length} of{' '}
            {historyPage.totalEntries} records.
          </p>
        ) : null}
        <div className="button-row">
          <button
            className="action-button action-button--secondary"
            disabled={isLoadingHistory || historyPageIndex === 0}
            onClick={onPreviousHistoryPage}
            type="button"
          >
            Previous
          </button>
          <button
            className="action-button action-button--secondary"
            disabled={
              isLoadingHistory ||
              !historyPage ||
              historyPage.totalPages === 0 ||
              historyPageIndex >= historyPage.totalPages - 1
            }
            onClick={onNextHistoryPage}
            type="button"
          >
            Next
          </button>
        </div>
        {isLoadingHistory ? (
          <p className="status-card__summary">Loading history...</p>
        ) : historyPage?.entries.length ? (
          <ul className="manifest-list">
            {historyPage.entries.map((entry) => (
              <li
                key={entry.recordId}
                className={`manifest-list__item manifest-list__item--stacked ${
                  selectedHistoryRecord?.recordId === entry.recordId
                    ? 'manifest-list__item--selected'
                    : ''
                }`}
              >
                <div className="review-item-main" onClick={() => onSelectHistoryEntry(entry)}>
                  <strong>{entry.sourcePath}</strong>
                  <p>{entry.destinationPath ?? entry.message ?? 'No destination recorded.'}</p>
                  <p>
                    {entry.operationKind} | session {entry.sessionId} |{' '}
                    {formatExecutionStrategy(entry.strategy)} | {entry.status}
                  </p>
                </div>
                <span
                  className={`status-pill ${
                    entry.undoEligible ? 'status-pill--ready' : 'status-pill--needsAttention'
                  }`}
                >
                  {entry.undoEligible ? 'undo ready' : 'undo unavailable'}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty-card">
            <strong>No history yet</strong>
            <p>Execute a plan to populate the append-only history log.</p>
          </div>
        )}
      </div>
      <div className="placeholder-stack">
        {selectedHistoryRecord ? (
          <div className="status-card">
            <header className="status-card__header">
              <div>
                <p className="status-card__eyebrow">Selected record</p>
                <h3>{selectedHistoryRecord.recordId}</h3>
              </div>
              <span className="status-pill status-pill--neutral">{selectedHistoryRecord.status}</span>
            </header>
            <div className="detail-stack">
              <p>Operation: {selectedHistoryRecord.operationKind}</p>
              <p>Source: {selectedHistoryRecord.sourcePath}</p>
              <p>
                Destination:{' '}
                {selectedHistoryRecord.destinationPath ?? 'No destination path was recorded.'}
              </p>
              <p>Strategy: {formatExecutionStrategy(selectedHistoryRecord.strategy)}</p>
              <p>Finished: {formatTimestamp(selectedHistoryRecord.finishedAtEpochMs)}</p>
              <p>
                Undo:{' '}
                {selectedHistoryRecord.undoEligible
                  ? 'Available now.'
                  : selectedHistoryRecord.undoBlockedReason ?? 'Unavailable.'}
              </p>
              {selectedHistoryRecord.message ? <p>{selectedHistoryRecord.message}</p> : null}
            </div>
            <div className="button-row">
              <button
                className="action-button"
                disabled={
                  isUndoingHistory ||
                  !selectedHistoryRecord.undoEligible ||
                  selectedHistoryRecord.operationKind === 'undo'
                }
                onClick={onUndoSelectedRecord}
                type="button"
              >
                {isUndoingHistory ? 'Undoing...' : 'Undo this record'}
              </button>
            </div>
          </div>
        ) : (
          <div className="empty-card">
            <strong>Select a record</strong>
            <p>Pick a history entry to inspect its strategy, outcome, and undo readiness.</p>
          </div>
        )}
        {selectedHistorySession ? (
          <div className="status-card">
            <header className="status-card__header">
              <div>
                <p className="status-card__eyebrow">Session drill-down</p>
                <h3>{selectedHistorySession.sessionId}</h3>
              </div>
              <span className="status-pill status-pill--neutral">{selectedHistorySession.status}</span>
            </header>
            <dl className="status-grid">
              <div>
                <dt>Approved</dt>
                <dd>{selectedHistorySession.approvedActionCount}</dd>
              </div>
              <div>
                <dt>Completed</dt>
                <dd>{selectedHistorySession.completedActionCount}</dd>
              </div>
              <div>
                <dt>Failed</dt>
                <dd>{selectedHistorySession.failedActionCount}</dd>
              </div>
              <div>
                <dt>Skipped</dt>
                <dd>{selectedHistorySession.skippedActionCount}</dd>
              </div>
            </dl>
            <p className="status-card__summary">
              {selectedHistorySession.operationKind} session
              {selectedHistorySession.relatedSessionId
                ? ` for ${selectedHistorySession.relatedSessionId}. `
                : '. '}
              Started {formatTimestamp(selectedHistorySession.startedAtEpochMs)} and finished{' '}
              {formatTimestamp(selectedHistorySession.finishedAtEpochMs)}
            </p>
            <div className="button-row">
              <button
                className="action-button"
                disabled={
                  isUndoingHistory ||
                  selectedHistorySession.operationKind === 'undo' ||
                  !selectedHistorySession.records.some((record) => record.operationKind === 'execute')
                }
                onClick={onUndoSelectedSession}
                type="button"
              >
                {isUndoingHistory ? 'Undoing...' : 'Best-effort undo session'}
              </button>
            </div>
            {selectedHistorySession.records.length > 0 ? (
              <>
                <p className="status-card__summary">
                  Showing {historySessionRecordPage.rangeStart}-{historySessionRecordPage.rangeEnd} of{' '}
                  {historySessionRecordPage.totalItems} session records.
                </p>
                <div className="button-row">
                  <button
                    className="action-button action-button--secondary"
                    disabled={historySessionRecordPage.page === 0}
                    onClick={onPreviousHistorySessionRecordPage}
                    type="button"
                  >
                    Previous records
                  </button>
                  <button
                    className="action-button action-button--secondary"
                    disabled={
                      historySessionRecordPage.totalPages === 0 ||
                      historySessionRecordPage.page >= historySessionRecordPage.totalPages - 1
                    }
                    onClick={onNextHistorySessionRecordPage}
                    type="button"
                  >
                    Next records
                  </button>
                </div>
                <ul className="manifest-list">
                  {historySessionRecordPage.items.map((record) => (
                    <li key={record.recordId} className="manifest-list__item manifest-list__item--stacked">
                      <div>
                        <strong>{record.sourcePath}</strong>
                        <p>{record.destinationPath ?? record.message ?? 'No destination recorded.'}</p>
                        <p>
                          {record.operationKind} | {formatExecutionStrategy(record.strategy)} |{' '}
                          {record.status}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        ) : (
          <div className="empty-card">
            <strong>No session selected</strong>
            <p>Session details appear here once a history record has been selected.</p>
          </div>
        )}
      </div>
    </section>
  )
}
