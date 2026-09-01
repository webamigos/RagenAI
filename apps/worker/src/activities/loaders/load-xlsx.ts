import { readFile } from 'fs/promises';
import * as XLSX from 'xlsx';
import type { Document } from '../../types/Document';
import { logger } from '../../services/logger';
import {
  ensureLocalFile,
  type FileLocator,
} from '../../services/ensure-local-file';

export const loadXlsx = async (locator: FileLocator): Promise<Document[]> => {
  logger.info({ fileName: locator.fileName }, 'Loading Excel file');

  const filePath = await ensureLocalFile(locator);
  const buffer = await readFile(filePath);
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  const docs: Document[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      continue;
    }

    const csv = XLSX.utils.sheet_to_csv(sheet);
    if (csv.trim()) {
      // pageContent is pure CSV so the csv-row-group-splitter (ADR-17) can
      // parse it cleanly. Sheet identity is kept in metadata.sheetName
      // (camelCase matches the other loader-local annotations like
      // fileType / fileName). prepareMetadata maps this to snake_case
      // `sheet_name` when building the canonical VectorStoreDocumentMetadata
      // that lands in Qdrant — see src/activities/embeddings/prepare-metadata.ts.
      docs.push({
        pageContent: csv,
        metadata: {
          source: filePath,
          fileType: 'XLSX',
          fileName: locator.fileName,
          sheetName,
        },
      });
    }
  }

  return docs;
};
