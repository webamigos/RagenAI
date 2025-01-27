import { Document } from '@langchain/core/documents';
import { DocumentLoader } from '@langchain/core/document_loaders/base';
import { parseSrtToSegmentsUsingLLM } from '@/app/api/threads/services/parseSrtWithLLM';
import { TextSplitter } from 'langchain/text_splitter';
import * as fs from 'node:fs';

type SRTLLMDocumentLoaderProps = {
  filePath: string;
  fileName: string;
  fileId: string;
  organizationId: string;
};

/**
 * Custom SRT document loader that implements SRT processing with LLM processing.
 * LLM is prompted to process the SRT content into meaningful segments
 * @implements {DocumentLoader}
 */
export class SRTLLMDocumentLoader implements DocumentLoader {
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

  async load(): Promise<Document<Record<string, any>>[]> {
    try {
      const fileContent = await fs.promises.readFile(this.filePath, 'utf-8');
      const segments = await parseSrtToSegmentsUsingLLM(
        this.organizationId,
        fileContent,
        200,
        300
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

  async loadAndSplit(
    splitter?: TextSplitter
  ): Promise<Document<Record<string, any>>[]> {
    const docs = await this.load();
    return splitter ? await splitter.splitDocuments(docs) : docs;
  }
}
