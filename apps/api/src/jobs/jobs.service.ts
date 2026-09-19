import { Injectable, Logger } from '@nestjs/common';
import {
  getJobRuntime,
  registerJobRuntime,
  type JobName,
  type JobPayloads,
} from '@ragenai/jobs';
import { BullMqJobRuntime } from '@ragenai/jobs-bullmq';

/**
 * Registers the adapters this application ships with.
 *
 * A module side effect, so that importing the service is enough — a call site
 * that resolved the runtime without it would get the seam's "no adapter
 * registered" error rather than a client. Registration rather than a dynamic
 * import is what keeps the specifier one a bundler can follow; see the
 * worker-runtime spec's §1.
 */
registerJobRuntime('bullmq', () => new BullMqJobRuntime());

/**
 * **Temporal is not registered here, since the worker-runtime spec's G3.**
 * `@ragenai/jobs-temporal` moved to
 * [`webamigos/ragen-enterprise`](https://github.com/webamigos/ragen-enterprise),
 * and the published image is therefore a BullMQ producer — which is what
 * ADR-44 makes the default.
 *
 * **This application could have loaded it dynamically, and deliberately does
 * not.** Nest compiles with `tsc` to CommonJS and runs the output on plain
 * Node, so the `await import(TEMPORAL_ADAPTER_PACKAGE)` that `apps/worker`
 * uses would work here too. `apps/web` is the one that genuinely cannot: a
 * Next build traces static imports at build time, and an untraced module is
 * not copied into the standalone output. Supporting Temporal producers in
 * `api` but not in `web` would leave a deployment where half the producers
 * enqueue to one engine — which reads as a worker that is merely slow, the
 * exact failure the seam was built to make impossible. The two applications
 * are treated the same because they are enqueued to by the same deployment.
 *
 * **A deployment running `WORKER_RUNTIME=temporal` builds both itself**,
 * adding `@ragenai/jobs-temporal` to the workspace's dependencies and one line
 * beside the registration above:
 *
 *     registerJobRuntime('temporal', () => new TemporalJobRuntime());
 *
 * Two lines per application, written down rather than made to look automatic —
 * `ragen-enterprise`'s `docs/durable-execution.md` has the procedure. Without
 * them `getJobRuntime()` throws the seam's *no adapter registered for
 * WORKER_RUNTIME="temporal"* on the first enqueue, which is the loud failure
 * the seam exists to give instead of a queue nobody reads.
 */

/**
 * Starting a background job, as `apps/api` sees it.
 *
 * Was `TemporalClientService`, which built a `Client` per call and named the
 * engine in its own type. What is left is the Nest binding: dependency
 * injection and a log line. The connection, the task queue and the lazy client
 * belong to the adapter, and `apps/api` no longer imports `@temporalio/*` at
 * all — which is the boundary
 * `tests/architecture/jobs-seam-is-the-only-runtime-import.test.ts` guards for
 * packages and the spec's Phase E makes absolute.
 */
@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  async start<N extends JobName>(
    job: N,
    runId: string,
    payload: JobPayloads[N],
  ): Promise<void> {
    await getJobRuntime().start(job, runId, payload);
    this.logger.log('Started job', { job, runId });
  }
}
