import type { EscalationMark, EscalationMarks } from '@/ports';

const KEY = 'qantum-tl.escalations.v2';

const isMark = (value: unknown): value is EscalationMark => {
  const mark = value as EscalationMark;
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof mark.visitId === 'string' &&
    (typeof mark.productId === 'string' || mark.productId === null) &&
    typeof mark.markedAt === 'string' &&
    typeof mark.request === 'string'
  );
};

const same = (a: Pick<EscalationMark, 'visitId' | 'productId'>, b: Pick<EscalationMark, 'visitId' | 'productId'>) =>
  a.visitId === b.visitId && a.productId === b.productId;

/** Storage can throw or be empty in private windows, so every access is guarded. */
export function createBrowserMarks(getStorage: () => Storage = () => window.localStorage): EscalationMarks {
  const read = (): EscalationMark[] => {
    try {
      const parsed: unknown = JSON.parse(getStorage().getItem(KEY) ?? '[]');
      return Array.isArray(parsed) ? parsed.filter(isMark) : [];
    } catch {
      return [];
    }
  };

  const write = (marks: EscalationMark[]) => {
    try {
      getStorage().setItem(KEY, JSON.stringify(marks));
      return true;
    } catch {
      return false;
    }
  };

  return {
    list: read,
    save: (marks) => write([...read().filter((item) => !marks.some((mark) => same(item, mark))), ...marks]),
    remove: (visitId, productId) => write(read().filter((item) => !same(item, { visitId, productId }))),
  };
}
