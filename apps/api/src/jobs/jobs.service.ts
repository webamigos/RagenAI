import { Injectable, Logger } from '@nestjs/common';
import {
  getJobRuntime,
  registerJobRuntime,
  type JobName,
  type JobPayloads,
} from '@ragenai/jobs';
import { TemporalJobRuntime } from '@ragenai/jobs-temporal';

/**
 * Registers the adapters this application ships with.
 *
 * A module side effect, so that importing the service is enough — a call site
 * that resolved the runtime without it would get the seam's "no adapter
 * registered" error rather than a client. Registration rather than a dynamic
 * import is what keeps the specifier one a bundler can follow; see the
 * worker-runtime spec's §1.
 */
registerJobRuntime('temporal', () => new TemporalJobRuntime());

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
