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
