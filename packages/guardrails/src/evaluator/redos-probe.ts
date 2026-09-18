import { Worker } from 'node:worker_threads';

/**
 * Running an untrusted regex against an adversarial string, with a deadline
 * that actually holds.
 *
 * The obvious implementation does not work, and it is worth saying why in the
 * place someone would come to simplify it. Timing the call:
 *
 * ```ts
 * const started = Date.now();
 * regex.test(fixture);              // ← never returns for (a+)+$
 * if (Date.now() - started > budget) { … }
 * ```
 *
 * measures a call that has to return in order to be measured. A backtracking
 * match is 2^n in the input length and cannot be interrupted — `(a+)+$` takes
 * 17 ms at 18 characters, 832 ms at 26, and does not finish at 10 000 within
 * any time anyone will wait. So the check that is supposed to catch a
 * catastrophic pattern hangs on exactly the patterns it exists to catch, and
 * every well-behaved one passes instantly. It is a gate that is open when it
 * matters and closed when it does not.
 *
 * A worker can be terminated, so the match runs there and the deadline is
 * enforced from outside it. That is the only shape that bounds this in Node.
 */

export type RedosProbeOutcome =
  /**
   * `elapsedMs` is `null` when the worker exited before its message was
   * delivered — the run finished inside the budget, which is the only thing
   * the decision rests on, but the measurement itself was lost in the race.
   * Reporting `0` there would be a number nobody measured.
   */
  | { kind: 'completed'; elapsedMs: number | null }
  | { kind: 'timed-out'; budgetMs: number }
  | { kind: 'failed'; message: string };

/**
 * The worker's whole body. Inline rather than a separate file because the
 * package is published as `dist/` and a sibling script would have to survive
 * the build, the bundler of whichever app imports this, and Next's server
 * bundling — three chances for it to be missing at exactly the moment an
 * operator saves a rule.
 */
const WORKER_SOURCE = `
const { parentPort, workerData } = require('node:worker_threads');
const { source, flags, fixture } = workerData;
try {
  const regex = new RegExp(source, flags);
  // Compiled and about to match. The parent starts its deadline here, not when
  // the worker was spawned — see the note on startup below.
  parentPort.postMessage({ kind: 'started' });
  const started = Date.now();
  regex.test(fixture);
  parentPort.postMessage({ kind: 'completed', elapsedMs: Date.now() - started });
} catch (error) {
  parentPort.postMessage({
    kind: 'failed',
    message: error instanceof Error ? error.message : String(error),
  });
}
`;

/**
 * How long the worker may take to exist and compile, before its match is timed.
 *
 * Spawning a worker is tens of milliseconds on an idle machine and can be far
 * more on a loaded one. Counting that against the match budget is how a
 * perfectly ordinary pattern gets refused because the CI box was busy — which
 * is exactly what happened: `\\d{4}-\\d{4}` was rejected during a run with
 * every workspace building in parallel. An operator whose valid rule is
 * refused, reproducibly on their machine and not on ours, has no way to tell
 * that from a real verdict.
 *
 * So the deadline starts when the worker says it is about to match. This cap
 * only stops a worker that never gets there at all.
 */
const STARTUP_ALLOWANCE_MS = 10_000;

export async function probeRegex(options: {
  source: string;
  flags: string;
  fixture: string;
  budgetMs: number;
}): Promise<RedosProbeOutcome> {
  const { source, flags, fixture, budgetMs } = options;

  return new Promise<RedosProbeOutcome>((resolve) => {
    let settled = false;
    let timer: NodeJS.Timeout;
    const worker = new Worker(WORKER_SOURCE, {
      eval: true,
      workerData: { source, flags, fixture },
      // The worker computes and reports; it has no reason to reach anything
      // else, and this is running a pattern an administrator just typed.
      resourceLimits: { maxOldGenerationSizeMb: 64 },
    });

    const settle = (outcome: RedosProbeOutcome): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      // Terminating an already-exited worker is a no-op, so this is safe on
      // every path and is what stops a runaway match outliving the request.
      void worker.terminate();
      resolve(outcome);
    };

    const arm = (ms: number, outcome: RedosProbeOutcome): void => {
      clearTimeout(timer);
      timer = setTimeout(() => settle(outcome), ms);
      // A pending timer should not hold the process open on the way out.
      timer.unref?.();
    };

    arm(STARTUP_ALLOWANCE_MS, {
      kind: 'failed',
      message: `worker did not start within ${STARTUP_ALLOWANCE_MS}ms`,
    });

    worker.on('message', (message: RedosProbeOutcome | { kind: 'started' }) => {
      if (message.kind === 'started') {
        arm(budgetMs, { kind: 'timed-out', budgetMs });
        return;
      }
      settle(message);
    });
    worker.on('error', (error: Error) => {
      settle({ kind: 'failed', message: error.message });
    });
    worker.on('exit', (code) => {
      // Reached when the worker is terminated from here, in which case the
      // timeout already settled; a non-zero exit otherwise is a real fault.
      settle(
        code === 0
          ? { kind: 'completed', elapsedMs: null }
          : { kind: 'failed', message: `worker exited with code ${code}` },
      );
    });
  });
}
