import type { VectorStoreDocument } from '@/libs/vector-store/types';
import { parseSrtToSegmentsUsingLLM } from '@/app/api/threads/services/parseSrtWithLLM';
import * as fs from 'node:fs';

/** Minimum number of words per SRT segment */
const SEGMENT_MIN_WORDS = 200;
/** Maximum number of words per SRT segment */
const SEGMENT_MAX_WORDS = 300;

type SRTLLMDocumentLoaderProps = {
  filePath: string;
  fileName: string;
  fileId: string;
  organizationId: string;
};

/**
 * Custom SRT document loader that implements SRT processing with LLM processing.
 * LLM is prompted to process the SRT content into meaningful segments
 */
export class SRTLLMDocumentLoader {
  private filePath: string;
  private fileName: string;
  private fileId: string;
  private organizationId: string;

  constructor({
    filePath,
    fileName,
    fileId,
    organizationId,
  }: SRTLLMDocumentLoaderProps) {
    this.filePath = filePath;
    this.fileName = fileName;
    this.fileId = fileId;
    this.organizationId = organizationId;
  }

  async load(): Promise<VectorStoreDocument[]> {
    try {
      const fileContent = await fs.promises.readFile(this.filePath, 'utf-8');
      const segments = await parseSrtToSegmentsUsingLLM(
        this.organizationId,
        fileContent,
        SEGMENT_MIN_WORDS,
        SEGMENT_MAX_WORDS,
      );

      return segments.map((segment, index) => ({
        pageContent: segment,
        metadata: {
          fileName: this.fileName,
          fileId: this.fileId,
          segmentId: index + 1,
          source: this.filePath,
        },
      }));
    } catch (error) {
      throw new Error(`Failed to process SRT document: ${error}`);
    }
  }
}
