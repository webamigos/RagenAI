import { z } from 'zod';
import {
  MEMORY_MAX_CHARS,
  MEMORY_MAX_ENTRIES,
} from '@ragenai/platform-contracts';

// Declared once, in platform-contracts, because the worker writes what this
// app shows and edits (spec 2026-09-27-personal-memory-across-threads).
export { MEMORY_MAX_CHARS, MEMORY_MAX_ENTRIES };

/** One memory's text, as a user edits it or an extraction writes it. */
export const memoryContentSchema = z
  .string()
  .trim()
  .min(1)
  .max(MEMORY_MAX_CHARS);

export const memoryPublicIdSchema = z.string().uuid();

/** A memory as its owner sees it. Never includes another user's rows. */
export interface UserMemoryView {
  publicId: string;
  content: string;
  /** The thread that last wrote it; null once that thread is gone. */
  sourceThread: { id: string; title: string | null } | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MemorySettings {
  /** Whether new turns may write memories. True until the user turns it off. */
  extractionEnabled: boolean;
}

/**
 * A thread id as the `threads.id` column holds it: any 8-4-4-4-12 hex id.
 * `z.uuid()` would also demand an RFC 4122 version, refusing threads seeded
 * or imported with a fixed id, whose memory line would then never show.
 */
export const memoryThreadIdSchema = z.guid();

/**
 * Whether the line under an answer may offer undo for one change.
 * `stale`: the memory was written again since — by a later extraction or a
 * settings edit — or, for a DELETE, exists again; undoing would overwrite a
 * newer statement, so the line points at settings instead.
 */
export type MemoryChangeState = 'undoable' | 'undone' | 'stale';

/** One change a turn made to the user's memory, as the thread shows it. */
export interface MemoryChangeView {
  publicId: string;
  operation: 'ADD' | 'UPDATE' | 'DELETE';
  /** The statement now (ADD, UPDATE), or the one forgotten (DELETE). */
  content: string;
  state: MemoryChangeState;
}

/** A thread's changes, keyed by the assistant message whose turn made them. */
export type ThreadMemoryChanges = Record<string, MemoryChangeView[]>;

/**
 * What an undo did. `full`: undoing a DELETE would restore a memory past
 * `MEMORY_MAX_ENTRIES`, which an extraction is not allowed to do either.
 */
export type UndoMemoryChangeResult =
  'undone' | 'already-undone' | 'stale' | 'full';
