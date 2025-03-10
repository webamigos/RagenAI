import { Document } from '@langchain/core/documents';
import { DocumentLoader } from '@langchain/core/document_loaders/base';
import { processPDFDocument } from '@/libs/chains/pdf-process-rag/chain';
import { TextSplitter } from 'langchain/text_splitter';

type PDFOCRDocumentLoaderProps = {
  filePath: string;
  fileName: string;
  fileId: string;
  organizationId: string;
  projectId?: number;
};

/**
 * Custom PDF document loader that implements PDF processing with LLM capabilities.
 * LLM is prompted to describe the PDF content (including images, tables, etc.)
 * @implements {DocumentLoader}
 */
export class PDFOCRDocumentLoader implements DocumentLoader {
  private filePath: string;
  private fileName: string;
  private fileId: string;
  private organizationId: string;
  private projectId?: number;

  constructor({
    filePath,
    fileName,
    fileId,
    organizationId,
    projectId,
  }: PDFOCRDocumentLoaderProps) {
    this.filePath = filePath;
    this.fileName = fileName;
    this.fileId = fileId;
    this.organizationId = organizationId;
    this.projectId = projectId;
  }

  async load(): Promise<Document<Record<string, any>>[]> {
    const { rawDocs, success, message } = await processPDFDocument(
      this.filePath,
      this.fileName,
      this.fileId,
      this.organizationId,
      this.projectId
    );

    if (!success) {
      throw new Error(`Failed to process PDF document: ${message}`);
    }

    return rawDocs;
  }

  async loadAndSplit(
    splitter?: TextSplitter
  ): Promise<Document<Record<string, any>>[]> {
    const docs = await this.load();
    return splitter ? await splitter.splitDocuments(docs) : docs;
  }
}
