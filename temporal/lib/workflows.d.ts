/**
 * Workflow Definition
 */
import * as wf from '@temporalio/workflow';
import { type StartEmbeddingProcessInput } from './shared';
type EmbeddingState =
  | 'EMBEDDING_PENDING'
  | 'EMBEDDING_DONE'
  | 'EMBEDDING_CANCELED';
export declare const cancelEmbeddingSignal: wf.SignalDefinition<
  [],
  'cancelEmbedding'
>;
export declare const embeddingStateQuery: wf.QueryDefinition<
  EmbeddingState,
  [],
  string
>;
export declare function EmbeddingWorkflow({
  documentId,
}: StartEmbeddingProcessInput): Promise<string>;
export declare function newEstimateAgeWorkflow({
  name,
}: {
  name: string;
}): Promise<string>;
export {};
//# sourceMappingURL=workflows.d.ts.map
