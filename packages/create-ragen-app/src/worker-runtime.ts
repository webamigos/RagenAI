import { randomBytes } from 'node:crypto';

/**
 * Which engine runs background jobs, and what choosing BullMQ configures.
 *
 * Mirrors `WORKER_RUNTIME_SEAM` in `@ragenai/env`. Copied rather than imported
 * for the reason `storage-provider.ts` gives: this package is published to npm
 * and `@ragenai/env` is private, so depending on it would make
 * `npm create ragen-app` unresolvable.
 */

export type WorkerRuntimeChoice = 'temporal' | 'bullmq';

export const WORKER_RUNTIME_LABELS: Record<WorkerRuntimeChoice, string> = {
  temporal: 'Temporal — the default. Needs the Temporal service running.',
  bullmq: 'BullMQ — runs on the Redis this install already has.',
};

/**
 * A password the operator never has to invent, and that is never the same
 * twice.
 *
 * The dashboard is off unless both credentials are set, so an installer that
 * left them blank would ship the runtime with no way to see the queues — which
 * is the thing the Temporal UI used to provide for free. Writing them is the
 * point.
 *
 * **Generated rather than a fixed default.** A password shipped in this
 * repository is the same password on every install, on a port that exposes
 * every job's payload; the first person to read the source has it everywhere.
 * Generating costs the operator nothing — they type nothing either way — and
 * the value is printed once so it can be put in a password manager.
 *
 * Short enough to retype by hand, unlike `generateSecret()`'s 64 hex
 * characters: this one is read off a terminal and typed into a browser prompt.
 */
export function generateAdminPassword(): string {
  return randomBytes(12).toString('base64url');
}

export const DEFAULT_ADMIN_USER = 'admin';

/**
 * How many documents the worker ingests at once, written explicitly rather
 * than left to the code's default.
 *
 * It matches `DEFAULT_CONCURRENCY` in `@ragenai/jobs-bullmq`, which D2 raised
 * from 10 to 20 on the strength of the same measurement: twenty documents
 * uploaded at once took a median of 24.9s each at 10 and 12.3s at 20, the whole
 * difference being time spent waiting for a slot.
 *
 * **Written anyway, even though it now equals the default.** The number the
 * operator has to revisit is this one — it is the first thing to lower when a
 * provider starts rate-limiting — and a default they never see is not a knob
 * they can find. If the two ever diverge, this line is the install's answer and
 * the code's is the fallback for everyone else.
 *
 * **A constant, not a guess from the machine.** `os.cpus().length` is the
 * tempting input and it measures the wrong thing: an ingest is almost entirely
 * waiting — on storage, on the parser, on the embedding provider — so cores
 * predict nothing about how many can be in flight. A number derived from
 * hardware would look principled and mean less than this one.
 *
 * Written into `.env` rather than applied silently, because the ceiling that
 * really binds is the model provider's rate limit, and the operator is the
 * only one who knows it. A value they can see is a value they can raise.
 */
export const DEFAULT_WORKER_CONCURRENCY = '20';

export interface WorkerRuntimeSelection {
  choice: WorkerRuntimeChoice;
  envUpdates: Record<string, string>;
  /** Shown once after the install, when there is something to show. */
  dashboard?: { user: string; password: string; port: string };
}

export function resolveWorkerRuntimeSelection(
  choice: WorkerRuntimeChoice,
): WorkerRuntimeSelection {
  // Only an explicit `bullmq` writes dashboard credentials. Matching on the
  // other branch instead would make any unexpected value — a future variant, a
  // mistyped flag — quietly configure an operator port.
  if (choice !== 'bullmq') {
    return { choice: 'temporal', envUpdates: { WORKER_RUNTIME: 'temporal' } };
  }

  const password = generateAdminPassword();
  const port = '8090';

  return {
    choice,
    envUpdates: {
      WORKER_RUNTIME: 'bullmq',
      WORKER_CONCURRENCY: DEFAULT_WORKER_CONCURRENCY,
      WORKER_ADMIN_USER: DEFAULT_ADMIN_USER,
      WORKER_ADMIN_PASSWORD: password,
      WORKER_ADMIN_PORT: port,
    },
    dashboard: { user: DEFAULT_ADMIN_USER, password, port },
  };
}
