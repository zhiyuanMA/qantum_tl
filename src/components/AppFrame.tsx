'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useApp } from './AppProvider';

function LeaderSelect() {
  const { load, leaderId, setLeaderId } = useApp();
  if (load.status !== 'ready') return null;
  return (
    <label className="leader-select">
      <span>Viewing as</span>
      <select value={leaderId} onChange={(event) => setLeaderId(event.target.value)}>
        {load.snapshot.leaders.map((leader) => (
          <option key={leader.id} value={leader.id}>
            {leader.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function AppFrame({ children }: { children: ReactNode }) {
  return (
    <>
      <p className="sample-banner">
        <strong>Sample data.</strong> Plans, usage, stock, deliveries and approvals are invented for this exercise. Only
        the solution catalogue was supplied.
      </p>
      <header className="app-header">
        <Link href="/" className="app-title">
          Team leader readiness
        </Link>
        <LeaderSelect />
      </header>
      <main className="app-main">{children}</main>
    </>
  );
}
