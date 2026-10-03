import type { MemoryChangeState } from '../contracts/memory.types';

/**
 * Whether one change can still be undone (spec
 * 2026-09-27-personal-memory-across-threads, "In the thread"). Every write
 * to a memory increments its `version`, and a change row stores the version
 * it produced, so:
 *
 * - an ADD or UPDATE is undoable while the memory is still at that version —
 *   a later extraction or a settings edit moved it on, and undoing would
 *   overwrite or delete the newer statement;
 * - a DELETE is undoable while no memory with that `publicId` exists.
 *
 * The undo command applies the same conditions in its `where` clauses; this
 * function is what the line shows before anyone clicks.
 */
export function memoryChangeState(
  change: {
    operation: 'ADD' | 'UPDATE' | 'DELETE';
    resultVersion: number | null;
    undoneAt: Date | null;
  },
  current: { version: number } | null,
): MemoryChangeState {
  if (change.undoneAt) {
    return 'undone';
  }
  if (change.operation === 'DELETE') {
    return current === null ? 'undoable' : 'stale';
  }
  return current !== null && current.version === change.resultVersion
    ? 'undoable'
    : 'stale';
}
