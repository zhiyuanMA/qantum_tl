'use client';

import Link from 'next/link';
import {
  formatDate,
  STATE_GUIDANCE,
  type CoverageKind,
  type LineView,
  type ReadinessSnapshot,
  type VisitDetail,
} from '@/application/readiness-service';
import type { AlternativeOption, LineStatus, ScenarioImpact } from '@/domain/types';
import { useApp } from './AppProvider';
import { EscalationComposer } from './EscalationComposer';
import { formatTimestamp } from './format';
import { LoadBoundary } from './LoadBoundary';
import { EscalatedTag, StateBadge } from './StateBadge';

const LINE_LABELS: Record<LineStatus, string> = {
  COVERED: 'Covered',
  DELIVERY: 'Depends on delivery',
  SHORT: 'Short',
  CONFLICT: 'Stock conflict',
  REVIEW: 'Needs data review',
};

const IMPACT_LABELS: Record<ScenarioImpact, string> = {
  AFFECTED: 'Affected by shortage',
  AT_RISK: 'At risk',
  CLEAR: 'Materials covered',
  NO_PRODUCTS: 'No products listed in catalogue',
};

const COVERAGE_LABELS: Record<CoverageKind, string> = {
  RESERVED: 'Reserved',
  STOCK: 'From stock',
  INBOUND: 'Inbound',
  CONTESTED: 'Contested',
  SHORT: 'Short',
};

function CoverageBar({ line }: { line: LineView }) {
  if (line.coverage.length === 0) return null;
  return (
    <div className="coverage-bar" aria-hidden="true">
      {line.coverage.map((part) => (
        <span
          key={part.kind}
          className={`coverage-part coverage-${part.kind.toLowerCase()}`}
          style={{ flexGrow: part.share }}
          title={`${COVERAGE_LABELS[part.kind]}: ${part.quantity} ${line.unit ?? ''}`}
        />
      ))}
    </div>
  );
}

const quantity = (value: number | null, unit: string | null) => (value === null ? 'Unknown' : `${value} ${unit ?? ''}`.trim());

function MaterialCard({ line }: { line: LineView }) {
  return (
    <article className={`material material-${line.status.toLowerCase()}`}>
      <h3>{line.productName}</h3>
      <p className="material-status">
        {LINE_LABELS[line.status]}
        {line.escalation && (
          <span className="material-escalated">
            {' '}
            · <span aria-hidden="true">✉</span> Escalated {formatTimestamp(line.escalation.markedAt)}
          </span>
        )}
      </p>
      <CoverageBar line={line} />
      <dl className="quantities">
        <div>
          <dt>Required</dt>
          <dd>{quantity(line.required, line.unit)}</dd>
        </div>
        <div>
          <dt>Reserved</dt>
          <dd>{line.reserved}</dd>
        </div>
        <div>
          <dt>From stock</dt>
          <dd>{line.fromStock}</dd>
        </div>
        <div>
          <dt>Inbound</dt>
          <dd>{line.fromInbound}</dd>
        </div>
        <div>
          <dt>Shortage</dt>
          <dd>{line.shortage}</dd>
        </div>
      </dl>
      <ul className="line-notes">
        {line.conflict && (
          <li>
            {line.conflict.totalRequired} needed and {line.conflict.supply} available across{' '}
            {line.conflict.visits.join(', ')}.
          </li>
        )}
        {line.takenBy.map((taker) => (
          <li key={`${taker.label}-${taker.kind}`}>
            {taker.kind === 'Reserved' ? 'Reserved for' : 'Planned use by'} {taker.label}: {taker.quantity} {line.unit}
          </li>
        ))}
        {line.countedDeliveries.map((delivery) => (
          <li key={delivery.id}>
            Delivery counted: {delivery.quantity} {line.unit} due {formatDate(delivery.expectedDate)}
          </li>
        ))}
        {line.uncountedDeliveries.map((delivery) => (
          <li key={delivery.id}>
            Delivery not counted: {delivery.quantity} {line.unit} due {formatDate(delivery.expectedDate)} (
            {delivery.confirmed ? 'too late for this visit' : 'unconfirmed'})
          </li>
        ))}
        {line.reviewReasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
        <li className="muted">Stock as of {line.stockAsOf ? formatTimestamp(line.stockAsOf) : 'unknown'}</li>
      </ul>
    </article>
  );
}

function AlternativeCard({ option }: { option: AlternativeOption }) {
  const approved = option.kind === 'APPROVED_SAMPLE';
  return (
    <article className="alternative">
      <h3>
        Solution {option.solution.id} <span className="muted small">({option.solution.supplierRef})</span>
      </h3>
      <p className={approved ? 'tag tag-approved' : 'tag tag-candidate'}>
        {approved ? 'Approved (sample record)' : 'Catalogue candidate: not approved'}
      </p>
      {option.approval ? (
        <p className="small">
          For scenario {option.scenarioId}. Approved by {option.approval.approver} for this site, until{' '}
          {formatDate(option.approval.validUntil)}. Evidence: {option.approval.evidenceRef}.
        </p>
      ) : (
        <p className="small">
          For scenario {option.scenarioId}. Its catalogue fields match, but that does not prove it suits this
          installation. A qualified person must review the evidence first.
        </p>
      )}
      <p className="small">
        {option.stockSufficient === true && 'Enough stock for this scenario on the current plan.'}
        {option.stockSufficient === false && 'Not enough stock for this alternative.'}
        {option.stockSufficient === null && 'Stock cannot be confirmed for this alternative.'} This visit stays as it
        is until the nominated solution changes.
      </p>
    </article>
  );
}

function Detail({ snapshot, detail }: { snapshot: ReadinessSnapshot; detail: VisitDetail }) {
  return (
    <>
      <p>
        <Link href="/">← All visits</Link>
      </p>
      <h1>{detail.siteName}</h1>
      <p className="muted">
        {formatDate(detail.plannedDate)} · {detail.teamName} · {detail.id} · {detail.stockPoolName}
      </p>

      <section className="decision" aria-label="Readiness decision">
        <p className="badges">
          <StateBadge state={detail.state} />
          {detail.escalation && <EscalatedTag level={detail.escalation.level} />}
        </p>
        <p className="decision-headline">{detail.headline}</p>
        {detail.otherRisks.length > 0 && <p className="other-risks">Also: {detail.otherRisks.join('; ')}</p>}
        <p>{STATE_GUIDANCE[detail.state]}</p>
        {detail.warnings.length > 0 && (
          <div className="warnings">
            <h2>Data warnings</h2>
            <ul>
              {detail.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <div className={detail.canEscalate ? 'detail-layout' : ''}>
        <div className="detail-main">
          <section aria-labelledby="materials-heading">
            <h2 id="materials-heading">Materials</h2>
            {detail.lines.length === 0 ? (
              <p className="notice">No products are listed in the catalogue for this visit&apos;s solutions.</p>
            ) : (
              <div className="materials">
                {detail.lines.map((line) => (
                  <MaterialCard key={line.productId} line={line} />
                ))}
              </div>
            )}
          </section>

          <section aria-labelledby="scenarios-heading">
            <h2 id="scenarios-heading">Scenarios</h2>
            <ul className="scenarios">
              {detail.scenarios.map(({ scenario, solution, impact }) => (
                <li key={scenario.id}>
                  <strong>{scenario.location}</strong>
                  <span>
                    {scenario.id} · Solution {scenario.solutionId} · {scenario.penetrations} penetrations
                  </span>
                  {solution && (
                    <span className="muted small">
                      {solution.serviceType} {solution.serviceSize}, {solution.substrate}
                    </span>
                  )}
                  <span className="impact">{IMPACT_LABELS[impact]}</span>
                </li>
              ))}
            </ul>
          </section>

          {detail.alternatives.length > 0 && (
            <section aria-labelledby="alternatives-heading">
              <h2 id="alternatives-heading">Alternative solutions</h2>
              <div className="materials">
                {detail.alternatives.map((option) => (
                  <AlternativeCard key={`${option.scenarioId}-${option.solution.id}`} option={option} />
                ))}
              </div>
            </section>
          )}
        </div>
        {detail.canEscalate && (
          <aside className="detail-side">
            <EscalationComposer
              key={detail.id}
              snapshot={snapshot}
              scope={{ kind: 'VISIT', visitId: detail.id }}
              heading="Escalate this visit"
            />
          </aside>
        )}
      </div>
    </>
  );
}

function Resolved({ snapshot, visitId }: { snapshot: ReadinessSnapshot; visitId: string }) {
  const { leaderId, escalations } = useApp();
  const result = snapshot.visitDetail(leaderId, visitId, escalations);
  if (result.status === 'FOUND') return <Detail snapshot={snapshot} detail={result.detail} />;
  return (
    <div className="notice">
      <h1>{result.status === 'OTHER_TEAM' ? 'This visit belongs to another team' : 'Visit not found'}</h1>
      <p>
        {result.status === 'OTHER_TEAM'
          ? `It is planned for ${result.teamName}. Change "Viewing as" to see it.`
          : 'It may be outside the planning window, or it may no longer be planned.'}
      </p>
      <Link href="/">Back to all visits</Link>
    </div>
  );
}

export function VisitDetailView({ visitId }: { visitId: string }) {
  return <LoadBoundary>{(snapshot) => <Resolved snapshot={snapshot} visitId={visitId} />}</LoadBoundary>;
}
