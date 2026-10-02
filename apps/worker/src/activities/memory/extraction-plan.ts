import { z } from 'zod';
import {
  MEMORY_DATED_GRACE_DAYS,
  MEMORY_MAX_CHARS,
  MEMORY_MAX_ENTRIES,
  MEMORY_MAX_OPERATIONS,
} from '@ragenai/platform-contracts';
import type { MemoryExtractSkip } from '@ragenai/jobs';

/**
 * The decisions behind a memory extraction, apart from its I/O (spec
 * 2026-09-27-personal-memory-across-threads, C1): what the model may return,
 * which of its operations apply, and whether the job may write at all.
 */

/** What the model is asked for: a list of operations, nothing else. */
/**
 * The shape the model is asked for, and what structured output holds it to.
 * Each operation names its kind in `op`. This used to be `z.unknown()[]`, and
 * the prompt never named the field, so models wrote `"operation": "ADD"` and
 * every operation failed the `op` union below: extraction ran on every turn
 * and stored nothing (C2's eval: 0 of 19 keep cases written).
 */
export const extractionAnswerSchema = z.object({
  operations: z
    .array(
      // Every field present, null when it does not apply. With them optional,
      // structured output on gemini-2.5-flash left `content` out of every
      // UPDATE (C2's role-update case, 0 of 3), and an UPDATE without its
      // statement is dropped.
      z.object({
        op: z.enum(['ADD', 'UPDATE', 'DELETE']),
        ref: z.string().nullable(),
        content: z.string().nullable(),
        until: z.string().nullable(),
      }),
    )
    .default([]),
});

/** What parsing accepts: any list, so each entry is judged on its own below. */
const answerShape = z.object({
  operations: z.array(z.unknown()).default([]),
});

/**
 * `operation` for `op`. Structured output asks for `op`, but a provider
 * without it falls back to a loose parse of the text, and the field name is
 * the one thing models were seen to rename.
 */
function withOpField(candidate: unknown): unknown {
  if (candidate === null || typeof candidate !== 'object') {
    return candidate;
  }
  let entry = candidate as Record<string, unknown>;
  if (!('op' in entry) && 'operation' in entry) {
    const { operation, ...rest } = entry;
    entry = { ...rest, op: operation };
  }
  // A field that does not apply arrives as null (the schema asks for every
  // field), or as the string "null"; either means absent.
  for (const field of ['ref', 'content', 'until'] as const) {
    const value = entry[field];
    if (value === null || value === 'null' || value === '') {
      const { [field]: _dropped, ...rest } = entry;
      entry = rest;
    }
  }
  return entry;
}

const content = z.string().trim().min(1).max(MEMORY_MAX_CHARS);
/** `YYYY-MM-DD`, the date an ongoing-work memory names. */
const until = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional();

const operationSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('ADD'), content, until }),
  z.object({ op: z.literal('UPDATE'), ref: z.string().min(1), content, until }),
  z.object({ op: z.literal('DELETE'), ref: z.string().min(1) }),
]);

export type MemoryOperation = z.infer<typeof operationSchema>;

/**
 * Parse the answer. Each operation is checked on its own, so one over-long
 * statement or one malformed entry is dropped and the rest apply; past the
 * tenth, operations are dropped unread. `null` when the answer is not even
 * the outer shape — a no-op, not a retry.
 */
export function parseOperations(
  answer: unknown,
): { operations: MemoryOperation[]; dropped: number } | null {
  const outer = answerShape.safeParse(answer);
  if (!outer.success) {
    return null;
  }
  const raw = outer.data.operations;
  const operations: MemoryOperation[] = [];
  let dropped = Math.max(0, raw.length - MEMORY_MAX_OPERATIONS);
  for (const candidate of raw.slice(0, MEMORY_MAX_OPERATIONS)) {
    const parsed = operationSchema.safeParse(withOpField(candidate));
    if (parsed.success) {
      operations.push(parsed.data);
    } else {
      dropped += 1;
    }
  }
  return { operations, dropped };
}

/**
 * A PII placeholder such as `<PERSON_1>` or `<EMAIL_ADDRESS_2>`. Placeholders
 * are numbered per turn and mean nothing in another thread, so a statement
 * carrying one is dropped — the prompt says so, and this checks it.
 */
const PII_PLACEHOLDER = /<[A-Z][A-Z0-9_]*_\d+>/;

export function containsPiiPlaceholder(text: string): boolean {
  return PII_PLACEHOLDER.test(text);
}

/** Two statements that differ only in case, spacing or a final full stop are one. */
export function normalizeMemory(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.!]+$/, '');
}

/** When an ongoing-work memory that names `until` stops being read. */
export function expiryFor(until: string | undefined): Date | null {
  if (!until) {
    return null;
  }
  const date = new Date(`${until}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return new Date(date.getTime() + MEMORY_DATED_GRACE_DAYS * 86_400_000);
}

/** A memory as the extraction read it, before the model saw it. */
export interface CurrentMemory {
  /** The short handle the prompt shows the model: `m1`, `m2`, … */
  ref: string;
  publicId: string;
  content: string;
  version: number;
  updatedAt: Date;
}

export interface MemoryPlan {
  adds: { content: string; expiresAt: Date | null }[];
  updates: {
    memory: CurrentMemory;
    content: string;
    expiresAt: Date | null;
  }[];
  deletes: CurrentMemory[];
  dropped: number;
}

/**
 * Which operations apply, against the memories the model was shown.
 *
 * - An operation naming a memory the model was not shown is dropped: a ref is
 *   only ever one of the `m<n>` handles in the prompt.
 * - One operation per memory; a second one on the same ref is dropped.
 * - An `ADD` identical to an existing memory, or to another `ADD`, after
 *   normalisation, is dropped.
 * - A statement carrying a PII placeholder is dropped.
 * - The entry limit holds: an `ADD` past `MEMORY_MAX_ENTRIES` is dropped and
 *   counted, and nothing old is evicted to make room.
 */
export function planMemoryApply(
  current: readonly CurrentMemory[],
  operations: readonly MemoryOperation[],
  maxEntries: number = MEMORY_MAX_ENTRIES,
): MemoryPlan {
  const byRef = new Map(current.map((memory) => [memory.ref, memory]));
  const touched = new Set<string>();
  const known = new Set(
    current.map((memory) => normalizeMemory(memory.content)),
  );
  const plan: MemoryPlan = { adds: [], updates: [], deletes: [], dropped: 0 };

  for (const operation of operations) {
    if (
      operation.op !== 'DELETE' &&
      containsPiiPlaceholder(operation.content)
    ) {
      plan.dropped += 1;
      continue;
    }
    if (operation.op === 'ADD') {
      const key = normalizeMemory(operation.content);
      if (known.has(key)) {
        plan.dropped += 1;
        continue;
      }
      known.add(key);
      plan.adds.push({
        content: operation.content,
        expiresAt: expiryFor(operation.until),
      });
      continue;
    }
    const memory = byRef.get(operation.ref);
    if (!memory || touched.has(operation.ref)) {
      plan.dropped += 1;
      continue;
    }
    touched.add(operation.ref);
    if (operation.op === 'DELETE') {
      plan.deletes.push(memory);
    } else {
      plan.updates.push({
        memory,
        content: operation.content,
        expiresAt: expiryFor(operation.until),
      });
    }
  }

  const room = maxEntries - (current.length - plan.deletes.length);
  if (plan.adds.length > room) {
    plan.dropped += plan.adds.length - Math.max(0, room);
    plan.adds = plan.adds.slice(0, Math.max(0, room));
  }
  return plan;
}

export function planWritesNothing(plan: MemoryPlan): boolean {
  return (
    plan.adds.length === 0 &&
    plan.updates.length === 0 &&
    plan.deletes.length === 0
  );
}

/**
 * Whether the job may write, read again under the profile lock: the
 * enqueue-time gate is minutes old by now. A job from before "forget
 * everything", an opt-out, an admin's deletion (the epoch), a member's
 * removal, or the key being turned off writes nothing.
 */
export function memoryWriteGate({
  featureOn,
  isMember,
  profile,
  enqueuedEpoch,
}: {
  featureOn: boolean;
  isMember: boolean;
  profile: { extractionEnabled: boolean; epoch: number } | null;
  enqueuedEpoch: number;
}): MemoryExtractSkip | null {
  if (!featureOn) {
    return 'disabled';
  }
  if (!isMember) {
    return 'not-member';
  }
  if (profile && !profile.extractionEnabled) {
    return 'opted-out';
  }
  if ((profile?.epoch ?? 0) !== enqueuedEpoch) {
    return 'stale';
  }
  return null;
}
