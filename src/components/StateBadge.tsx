import { STATE_LABELS } from '@/application/readiness-service';
import type { ReadinessState } from '@/domain/types';

export const STATE_ICONS: Record<ReadinessState, string> = {
  SHORT: '✕',
  STOCK_CONFLICT: '⇄',
  NEEDS_DATA_REVIEW: '?',
  DEPENDS_ON_DELIVERY: '◷',
  READY: '✓',
  NO_PRODUCTS_LISTED: '–',
};

export const stateClass = (state: ReadinessState) => state.toLowerCase().replaceAll('_', '-');

export const escalationText = (level: 'FULL' | 'PARTIAL') => (level === 'FULL' ? 'Escalated' : 'Partly escalated');

export function EscalatedTag({ level }: { level: 'FULL' | 'PARTIAL' }) {
  return (
    <span className="badge badge-escalated">
      <span aria-hidden="true">✉</span> {escalationText(level)}
    </span>
  );
}

export function StateBadge({ state }: { state: ReadinessState }) {
  return (
    <span className={`badge badge-${stateClass(state)}`}>
      <span aria-hidden="true">{STATE_ICONS[state]}</span> {STATE_LABELS[state]}
    </span>
  );
}
