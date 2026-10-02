/**
 * The size of a user's personal memory (spec
 * 2026-09-27-personal-memory-across-threads, "What a memory is"). Shared by
 * apps/web, which shows and edits memories, and apps/worker, which writes
 * them, so the two cannot disagree on what fits.
 */

/** A user has at most this many memories, so the whole set is loaded, not searched. */
export const MEMORY_MAX_ENTRIES = 50;

/** Characters per memory, after trimming. */
export const MEMORY_MAX_CHARS = 300;

/** At most this many operations from one extraction; the rest are dropped. */
export const MEMORY_MAX_OPERATIONS = 10;

/**
 * An ongoing-work memory that names a date is kept this many days past it,
 * then neither read nor listed.
 */
export const MEMORY_DATED_GRACE_DAYS = 30;

/** How long a change row — and so the undo it offers — is kept. */
export const MEMORY_CHANGE_RETENTION_DAYS = 30;
