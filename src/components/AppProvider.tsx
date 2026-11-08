'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createDefaultMarks, createDefaultService } from '@/adapters/composition';
import type { Escalations, ReadinessService, ReadinessSnapshot } from '@/application/readiness-service';
import { itemKey } from '@/domain/escalation';
import type { EscalationMark, EscalationMarks } from '@/ports';

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; snapshot: ReadinessSnapshot };

interface AppContextValue {
  load: LoadState;
  leaderId: string;
  setLeaderId: (id: string) => void;
  reload: () => void;
  escalations: Escalations;
  /** Marks items (keys from the composer) as escalated. Returns false when storage failed. */
  markEscalated: (keys: string[], request: string) => boolean;
  removeEscalation: (key: string) => boolean;
}

const AppContext = createContext<AppContextValue | null>(null);
const LEADER_KEY = 'qantum-tl.leader';
const DEFAULT_LEADER = 'leader-north';

const readLeader = () => {
  try {
    return window.localStorage.getItem(LEADER_KEY);
  } catch {
    return null;
  }
};

const saveLeader = (id: string) => {
  try {
    window.localStorage.setItem(LEADER_KEY, id);
  } catch {
    // A remembered leader is a convenience. The app works without it.
  }
};

const parseKey = (key: string): Pick<EscalationMark, 'visitId' | 'productId'> => {
  const [visitId = '', productId = '*'] = key.split('|');
  return { visitId, productId: productId === '*' ? null : productId };
};

export function AppProvider({
  children,
  service,
  marks,
}: {
  children: ReactNode;
  service?: ReadinessService;
  marks?: EscalationMarks;
}) {
  const resolvedService = useMemo(() => service ?? createDefaultService(), [service]);
  const resolvedMarks = useMemo(() => marks ?? createDefaultMarks(), [marks]);
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [leaderId, setLeader] = useState(DEFAULT_LEADER);
  const [escalations, setEscalations] = useState<Escalations>({});

  // Read after hydration, as the static HTML cannot know what this device stored.
  useEffect(() => {
    setEscalations(Object.fromEntries(resolvedMarks.list().map((mark) => [itemKey(mark.visitId, mark.productId), mark])));
  }, [resolvedMarks]);

  const markEscalated = useCallback(
    (keys: string[], request: string) => {
      const markedAt = new Date().toISOString();
      const marks = keys.map((key) => ({ ...parseKey(key), request, markedAt }));
      setEscalations((current) => ({ ...current, ...Object.fromEntries(keys.map((key, index) => [key, marks[index]!])) }));
      return resolvedMarks.save(marks);
    },
    [resolvedMarks],
  );

  const removeEscalation = useCallback(
    (key: string) => {
      setEscalations((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== key)));
      const { visitId, productId } = parseKey(key);
      return resolvedMarks.remove(visitId, productId);
    },
    [resolvedMarks],
  );

  const reload = useCallback(() => {
    setLoad({ status: 'loading' });
    resolvedService.load().then(
      (snapshot) => {
        const stored = readLeader();
        if (stored && snapshot.leaders.some((item) => item.id === stored)) setLeader(stored);
        setLoad({ status: 'ready', snapshot });
      },
      () => setLoad({ status: 'error' }),
    );
  }, [resolvedService]);

  // Runs on the client only, so the static HTML never carries a build-time date.
  useEffect(reload, [reload]);

  const setLeaderId = useCallback((id: string) => {
    saveLeader(id);
    setLeader(id);
  }, []);

  const value = useMemo(
    () => ({ load, leaderId, setLeaderId, reload, escalations, markEscalated, removeEscalation }),
    [load, leaderId, setLeaderId, reload, escalations, markEscalated, removeEscalation],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside AppProvider');
  return value;
}
