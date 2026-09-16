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
      WORKER_ADMIN_USER: DEFAULT_ADMIN_USER,
      WORKER_ADMIN_PASSWORD: password,
      WORKER_ADMIN_PORT: port,
    },
    dashboard: { user: DEFAULT_ADMIN_USER, password, port },
  };
}
