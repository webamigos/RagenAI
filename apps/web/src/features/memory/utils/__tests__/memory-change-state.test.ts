import { describe, expect, it } from 'vitest';

import { memoryChangeState } from '../memory-change-state';

const change = (
  operation: 'ADD' | 'UPDATE' | 'DELETE',
  resultVersion: number | null,
  undoneAt: Date | null = null,
) => ({ operation, resultVersion, undoneAt });

describe('memoryChangeState', () => {
  it('offers undo for a change nothing has touched since', () => {
    expect(memoryChangeState(change('ADD', 1), { version: 1 })).toBe(
      'undoable',
    );
    expect(memoryChangeState(change('UPDATE', 3), { version: 3 })).toBe(
      'undoable',
    );
    expect(memoryChangeState(change('DELETE', null), null)).toBe('undoable');
  });

  // A later extraction and a settings edit both increment `version`, so both
  // read the same here; the case names say which write moved it on.
  it.each([
    [
      'an ADD',
      'a later extraction updated it',
      change('ADD', 1),
      { version: 2 },
    ],
    ['an ADD', 'a settings edit changed it', change('ADD', 1), { version: 2 }],
    ['an ADD', 'it was deleted since', change('ADD', 1), null],
    [
      'an UPDATE',
      'a later extraction updated it',
      change('UPDATE', 2),
      { version: 3 },
    ],
    [
      'an UPDATE',
      'a settings edit changed it',
      change('UPDATE', 2),
      { version: 3 },
    ],
    ['an UPDATE', 'it was deleted since', change('UPDATE', 2), null],
  ])('refuses to undo %s when %s', (_op, _why, c, current) => {
    expect(memoryChangeState(c, current)).toBe('stale');
  });

  it('refuses to undo a DELETE once a memory with that id exists again', () => {
    expect(memoryChangeState(change('DELETE', null), { version: 1 })).toBe(
      'stale',
    );
  });

  it('reports an undone change as undone, whatever the memory says now', () => {
    const at = new Date();
    expect(memoryChangeState(change('ADD', 1, at), null)).toBe('undone');
    expect(memoryChangeState(change('DELETE', null, at), { version: 1 })).toBe(
      'undone',
    );
  });
});
