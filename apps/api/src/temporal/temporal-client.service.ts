import { Injectable, Logger } from '@nestjs/common';
import { Client, Connection } from '@temporalio/client';
import { TASK_QUEUE_NAME, Workflow } from './temporal.consts.js';

/**
 * Ported from apps/web's src/libs/temporal/client.ts
 * (`getTemporalClient`). See docs/adrs/21-monorepo-and-api-decoupling.md.
 *
 * `Connection.lazy()` defers the actual RPC connection until the first
 * call, so constructing a fresh `Client` per `startWorkflow()` call (same
 * as the original) needs no connection pooling here. TLS cert/key
 * support was commented out in the original too — not enabled anywhere
 * yet, so not ported.
 */
@Injectable()
export class TemporalClientService {
  private readonly logger = new Logger(TemporalClientService.name);

  private createClient(): Client {
    const connection = Connection.lazy({
      address: process.env.TEMPORAL_SERVER_ADDRESS || 'localhost:7233',
    });
    return new Client({ connection });
  }

  async startWorkflow(
    workflow: Workflow,
    workflowId: string,
    args: unknown[],
  ): Promise<void> {
    const client = this.createClient();
    await client.workflow.start(workflow, {
      taskQueue: TASK_QUEUE_NAME,
      workflowId,
      args,
    });
    this.logger.log('Started Temporal workflow', { workflow, workflowId });
  }
}
