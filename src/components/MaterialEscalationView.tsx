'use client';

import Link from 'next/link';
import type { ReadinessSnapshot } from '@/application/readiness-service';
import { useApp } from './AppProvider';
import { EscalationComposer } from './EscalationComposer';
import { LoadBoundary } from './LoadBoundary';

function MaterialEscalation({ snapshot, productId }: { snapshot: ReadinessSnapshot; productId: string }) {
  const { leaderId, escalations } = useApp();
  const composer = snapshot.composer(leaderId, { kind: 'PRODUCT', productId }, escalations);
  return (
    <>
      <p>
        <Link href="/">← All visits</Link>
      </p>
      {composer ? (
        <>
          <h1>{composer.title}</h1>
          <p className="muted">Your visits with a problem for this product. Send one message that covers them.</p>
          <div className="narrow">
            <EscalationComposer snapshot={snapshot} scope={{ kind: 'PRODUCT', productId }} heading="Escalate this product" />
          </div>
        </>
      ) : (
        <div className="notice">
          <h1>Nothing to escalate for this product</h1>
          <p>None of your visits has a problem with it at the moment.</p>
        </div>
      )}
    </>
  );
}

export function MaterialEscalationView({ productId }: { productId: string }) {
  return <LoadBoundary>{(snapshot) => <MaterialEscalation snapshot={snapshot} productId={productId} />}</LoadBoundary>;
}
