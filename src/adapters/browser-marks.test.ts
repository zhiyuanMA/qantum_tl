import { describe, expect, it } from 'vitest';
import { createBrowserMarks } from './browser-marks';

const memory = (): Storage => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  } as unknown as Storage;
};

const mark = (visitId: string, productId: string | null, request = 'EXPEDITE_SUPPLY') => ({
  visitId,
  productId,
  markedAt: '2026-11-09T00:00:00Z',
  request,
});

describe('browser marks', () => {
  it('saves several marks, replaces a mark for the same product, and removes one', () => {
    const storage = memory();
    const marks = createBrowserMarks(() => storage);
    expect(marks.save([mark('V-1', 'a'), mark('V-1', 'b'), mark('V-2', null)])).toBe(true);
    expect(marks.save([mark('V-1', 'a', 'CONFIRM_PRIORITY')])).toBe(true);
    expect(marks.list()).toEqual([mark('V-1', 'b'), mark('V-2', null), mark('V-1', 'a', 'CONFIRM_PRIORITY')]);
    expect(marks.remove('V-1', 'b')).toBe(true);
    expect(marks.remove('V-2', null)).toBe(true);
    expect(marks.list()).toEqual([mark('V-1', 'a', 'CONFIRM_PRIORITY')]);
  });

  it('AC13: reports failure when storage is unavailable', () => {
    const marks = createBrowserMarks(() => {
      throw new Error('denied');
    });
    expect(marks.save([mark('V-1', 'a')])).toBe(false);
    expect(marks.remove('V-1', 'a')).toBe(false);
    expect(marks.list()).toEqual([]);
  });

  it('ignores corrupt or malformed stored data', () => {
    const storage = memory();
    storage.setItem('qantum-tl.escalations.v2', '{bad');
    expect(createBrowserMarks(() => storage).list()).toEqual([]);
    storage.setItem('qantum-tl.escalations.v2', JSON.stringify([{ visitId: 'V-1' }, mark('V-2', 'a')]));
    expect(createBrowserMarks(() => storage).list()).toEqual([mark('V-2', 'a')]);
  });
});
