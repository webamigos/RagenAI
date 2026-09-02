import { type Document } from '../../types/Document';
import { processPDFDocument } from '../chains/pdf-process-rag/chain';
import { type UserFile } from '../db';

type PDFOCRDocumentLoaderProps = {
  filePath: string;
  fileName: UserFile['file_name'];
  fileId: UserFile['id'];
  orgId: UserFile['organization_id'];
  projectId: UserFile['project_id'];
};

export class PDFOCRDocumentLoader {
  private filePath: string;
  private fileName: UserFile['file_name'];
  private fileId: UserFile['id'];
  private orgId: UserFile['organization_id'];
  private projectId: UserFile['project_id'];

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
