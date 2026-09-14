import { type Document } from '../../types/Document.js';
import { processPDFDocument } from '../chains/pdf-process-rag/chain.js';
import { type UserFile } from '../db/index.js';

type PDFOCRDocumentLoaderProps = {
  filePath: string;
  fileName: UserFile['fileName'];
  fileId: UserFile['id'];
  orgId: UserFile['organizationId'];
  projectId: UserFile['projectId'];
};

export class PDFOCRDocumentLoader {
  private filePath: string;
  private fileName: UserFile['fileName'];
  private fileId: UserFile['id'];
  private orgId: UserFile['organizationId'];
  private projectId: UserFile['projectId'];

  constructor({
    filePath,
    fileName,
    fileId,
    orgId,
    projectId,
  }: PDFOCRDocumentLoaderProps) {
    this.filePath = filePath;
    this.fileName = fileName;
    this.fileId = fileId;
    this.orgId = orgId;
    this.projectId = projectId;
  }

  async load(): Promise<Document[]> {
    const { rawDocs, success, message } = await processPDFDocument(
      this.filePath,
      this.fileName,
      this.fileId,
      this.orgId,
      this.projectId,
    );

    if (!success) {
      throw new Error(`Failed to process PDF document: ${message}`);
    }

    return rawDocs;
  }
}
