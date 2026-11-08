'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ComposerScope, ReadinessSnapshot } from '@/application/readiness-service';
import type { EscalationRequest } from '@/domain/escalation';
import { useApp } from './AppProvider';
import { formatTimestamp } from './format';

interface Props {
  snapshot: ReadinessSnapshot;
  scope: ComposerScope;
  heading: string;
}

export function EscalationComposer({ snapshot, scope, heading }: Props) {
  const { leaderId, escalations, markEscalated, removeEscalation } = useApp();
  const composer = snapshot.composer(leaderId, scope, escalations);
  const [request, setRequest] = useState<EscalationRequest | null>(null);
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const [storageFailed, setStorageFailed] = useState(false);

  const activeRequest = request ?? composer?.defaultRequest ?? 'EXPEDITE_SUPPLY';
  useEffect(() => setUnchecked(new Set()), [activeRequest]);

  const eligible = useMemo(
    () => composer?.items.filter((item) => item.requests.includes(activeRequest)) ?? [],
    [composer, activeRequest],
  );
  const others = composer?.items.filter((item) => !item.requests.includes(activeRequest)) ?? [];
  const selectedItems = eligible.filter((item) => !unchecked.has(item.key));
  const selected = selectedItems.map((item) => item.key);
  // Marking again would only move the time, so only unmarked items are marked.
  const toMark = selectedItems.filter((item) => !item.escalation).map((item) => item.key);
  const markLabel =
    selected.length > 0 && toMark.length === 0
      ? 'Marked as escalated'
      : `I've sent it: mark ${toMark.length > 1 ? `${toMark.length} items` : 'it'} as escalated`;

  if (!composer) return null;

  const message = snapshot.escalation(leaderId, selected, activeRequest, note);
  const requestLabel = (value: EscalationRequest) => composer.requests.find((item) => item.value === value)?.label;

  const toggle = (key: string) =>
    setUnchecked((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${message.subject}\n\n${message.body}`);
      setCopyStatus('Copied. Paste it into your usual channel.');
    } catch {
      setCopyStatus('Copying is not available here. Select the message text and copy it.');
    }
  };

  return (
    <section aria-labelledby="escalate-heading" className="panel">
      <h2 id="escalate-heading">{heading}</h2>
      <p className="muted">Choose what you need, send the message through your usual channel, then mark it as escalated.</p>

      <label className="field">
        <span>What do you need?</span>
        <select value={activeRequest} onChange={(event) => setRequest(event.target.value as EscalationRequest)}>
          {composer.requests.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="field items">
        <legend>Include</legend>
        {eligible.map((item) => (
          <div key={item.key} className="item-row">
            <label className="item-check">
              <input type="checkbox" checked={!unchecked.has(item.key)} onChange={() => toggle(item.key)} />
              <span>
                <span className="item-label">{item.label}</span>
                <span className="small muted">{item.context}</span>
              </span>
            </label>
            {item.escalation && (
              <p className="item-mark small">
                <span aria-hidden="true">✉</span> Escalated {formatTimestamp(item.escalation.markedAt)} (
                {item.escalation.requestLabel}).{' '}
                <button
                  type="button"
                  className="link-button"
                  onClick={() => setStorageFailed(!removeEscalation(item.key))}
                  aria-label={`Remove escalation mark for ${item.label}`}
                >
                  Remove mark
                </button>
              </p>
            )}
          </div>
        ))}
        {others.length > 0 && (
          <p className="small muted">
            Needs a different request:{' '}
            {others.map((item) => `${item.label} (${requestLabel(item.requests[0] as EscalationRequest)})`).join('; ')}
          </p>
        )}
      </fieldset>

      <label className="field">
        <span>Note (optional)</span>
        <textarea value={note} rows={2} onChange={(event) => setNote(event.target.value)} />
      </label>

      <h3>Message preview</h3>
      <pre className="preview" tabIndex={0} aria-label="Escalation message preview">
        {message.subject ? `${message.subject}\n\n${message.body}` : message.body}
      </pre>

      <div className="actions">
        <button type="button" onClick={copy} disabled={selected.length === 0}>
          Copy message
        </button>
        <button
          type="button"
          className="secondary"
          disabled={toMark.length === 0}
          onClick={() => setStorageFailed(!markEscalated(toMark, activeRequest))}
        >
          {markLabel}
        </button>
      </div>

      <div aria-live="polite">
        {copyStatus && <p className="small">{copyStatus}</p>}
        {storageFailed && (
          <p className="small warning-text">
            The change could not be saved and will be lost when the page reloads. Your message is unaffected.
          </p>
        )}
      </div>
    </section>
  );
}
