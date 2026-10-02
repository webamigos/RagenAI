import { z } from 'zod';

/**
 * A user has at most this many memories, so the whole set fits in a prompt
 * and is loaded whole rather than searched (spec
 * 2026-09-27-personal-memory-across-threads, "What a memory is").
 */
export const MEMORY_MAX_ENTRIES = 50;

/** Characters per memory, after trimming. */
export const MEMORY_MAX_CHARS = 300;

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
