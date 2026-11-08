'use client';

import type { ReactNode } from 'react';
import type { ReadinessSnapshot } from '@/application/readiness-service';
import { useApp } from './AppProvider';

export function LoadBoundary({ children }: { children: (snapshot: ReadinessSnapshot) => ReactNode }) {
  const { load, reload } = useApp();
  if (load.status === 'loading') {
    return (
      <p role="status" className="notice">
        Loading visits…
      </p>
    );
  }
  if (load.status === 'error') {
    return (
      <div role="alert" className="notice notice-warning">
        <h1>Readiness could not be loaded</h1>
        <p>Do not assume materials are available. Try again, or check stock directly before the crew leaves.</p>
        <button type="button" onClick={reload}>
          Try again
        </button>
      </div>
    );
  }
  return <>{children(load.snapshot)}</>;
}
