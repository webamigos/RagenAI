import * as fs from 'node:fs';

import { type Document } from '../../types/Document';
import { parseSrtToSegmentsUsingLLM } from './parse-srt-to-segments';
import { parseSrtBlocks, findSegmentTimestamps } from './srt-block-parser';
import { type UserFile } from '../db';

type SRTLLMDocumentLoaderProps = {
  filePath: string;
  fileName: UserFile['fileName'];
  fileId: UserFile['id'];
  orgId: UserFile['organizationId'];
};

export class SRTLLMDocumentLoader {
  private filePath: string;
  private fileName: UserFile['fileName'];
  private fileId: UserFile['id'];
  private orgId: UserFile['organizationId'];

  constructor({
    filePath,
    fileName,
    fileId,
    orgId,
  }: SRTLLMDocumentLoaderProps) {
    this.filePath = filePath;
    this.fileName = fileName;
    this.fileId = fileId;
    this.orgId = orgId;
  }

  async load(): Promise<Document[]> {
    try {
      const fileContent = await fs.promises.readFile(this.filePath, 'utf-8');

      // Parse timestamped blocks BEFORE the LLM call so we can match
      // segments back to them after the LLM returns (ADR-17). This lets
      // us preserve timestamp metadata despite the LLM's semantic
      // segmentation dropping timing information.
      const blocks = parseSrtBlocks(fileContent);

      const segments = await parseSrtToSegmentsUsingLLM(
        this.orgId,
        fileContent,
        200,
        300,
      );

      return segments.map((segment, index) => {
        const timestamps = findSegmentTimestamps(segment, blocks);
        return {
          pageContent: segment,
          metadata: {
            fileName: this.fileName,
            fileId: this.fileId,
            segmentId: index + 1,
            source: this.filePath,
            // timestamp_start_ms / timestamp_end_ms are only set when the
            // LLM segment could be matched back to at least one original
            // block. Unmatched segments fall through with no timestamp
            // metadata — callers must treat the fields as optional.
            ...(timestamps ?? {}),
          },
        };
      });
    } catch (error) {
      throw new Error(`Failed to process SRT document: ${error}`);
    }
  }
}
