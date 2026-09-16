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
  bullmq: 'BullMQ — the default. Runs on the Redis this install already has.',
  temporal:
    'Temporal — durable execution, on a server you run yourself (ADR-44).',
};

/**
 * The published Redis port, not the standard one.
 *
 * `docker-compose.yml` maps Redis to 56379 for the reason Postgres is on
 * 55432: a native Redis on 6379 answers instead of the container, and nothing
 * about the resulting failure names a port.
 */
export const DEFAULT_REDIS_URL = 'redis://localhost:56379';

/**
 * What the address prompt starts from — the adapter's own fallback, and what
 * `.env.example` ships.
 *
 * Offered as a prefilled answer rather than written silently: right on a
 * laptop, wrong everywhere else, and a deployed worker pointing at its own
 * container connects to nothing and processes nothing with no error to read.
 * Temporal left the compose file with ADR-44, so this address now names a
 * server the operator runs — which makes it exactly the value they should see
 * before it is written.
 */
export const DEFAULT_TEMPORAL_SERVER_ADDRESS = 'localhost:7233';

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
 * uploaded at once took a median of 24.9s each at 10 and 12.3s at 20, the
 * difference sitting entirely before parsing began rather than in the work.
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

export interface WorkerRuntimeAnswers {
  /** Blank takes `DEFAULT_TEMPORAL_SERVER_ADDRESS`. */
  temporalServerAddress: string;
}

export interface WorkerRuntimeSelection {
  choice: WorkerRuntimeChoice;
  envUpdates: Record<string, string>;
  /** Shown once after the install, when there is something to show. */
  dashboard?: { user: string; password: string; port: string };
}

/**
 * **The runtime each variant cannot work without is written here**, not left to
 * whatever `.env.example` happens to ship. `REDIS_URL` is required under
 * BullMQ and `TEMPORAL_SERVER_ADDRESS` under Temporal, and since #1224 the
 * producers refuse to boot without the one their runtime names — so a wizard
 * that picks the runtime and not its address configures an install that stops
 * at startup. `create-ragen-app-knows-the-provider-seams.test.ts` holds this to
 * the seam.
 */
export function resolveWorkerRuntimeSelection(
  choice: WorkerRuntimeChoice,
  answers?: WorkerRuntimeAnswers,
): WorkerRuntimeSelection {
  // Only an explicit `temporal` leaves the default. The fallback used to point
  // the other way, when Temporal was what the compose file ran; now an
  // unexpected value — a future variant, a mistyped flag — lands on the runtime
  // this install actually ships, rather than on one that is no longer there.
  if (choice === 'temporal') {
    return {
      choice: 'temporal',
      envUpdates: {
        WORKER_RUNTIME: 'temporal',
        TEMPORAL_SERVER_ADDRESS:
          answers?.temporalServerAddress.trim() ||
          DEFAULT_TEMPORAL_SERVER_ADDRESS,
      },
    };
  }

  const password = generateAdminPassword();
  const port = '8090';

  return {
    choice: 'bullmq',
    envUpdates: {
      WORKER_RUNTIME: 'bullmq',
      REDIS_URL: DEFAULT_REDIS_URL,
      WORKER_CONCURRENCY: DEFAULT_WORKER_CONCURRENCY,
      WORKER_ADMIN_USER: DEFAULT_ADMIN_USER,
      WORKER_ADMIN_PASSWORD: password,
      WORKER_ADMIN_PORT: port,
    },
    dashboard: { user: DEFAULT_ADMIN_USER, password, port },
  };
}
