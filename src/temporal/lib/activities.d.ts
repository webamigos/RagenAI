import {
  type CancelEmbeddingProcessInput,
  type OnEmbeddingProcessCompletedInput,
} from './shared';
export declare const onEmbeddingProcessCompleted: ({
  documentId,
}: OnEmbeddingProcessCompletedInput) => Promise<string>;
export declare const cancelEmbeddingProcess: ({
  documentId,
}: CancelEmbeddingProcessInput) => Promise<string>;
export declare const estimateAge: (name: string) => Promise<number>;
//# sourceMappingURL=activities.d.ts.map
