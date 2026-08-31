import fs from 'fs';
import path from 'path';

import { v4 as uuidv4 } from 'uuid';

import { getStorageProvider } from './storage';
import { TMP_DIR } from '../utils/cleanup-tmp';
import { getFileExtension } from '../utils/get-file-extension';

const uploadToS3 = async (
  orgId: string,
  fileName: string,
  fileContent: Buffer,
) => {
  await getStorageProvider().upload(`${orgId}/${fileName}`, fileContent);
};

const deleteFromS3 = async (orgId: string, fileName: string) => {
  await getStorageProvider().delete(`${orgId}/${fileName}`);
};

/**
 * Retrieves file content from storage and writes it to a local temp file.
 * @param orgId - The organization ID
 * @param fileName - The name of the file to retrieve
 * @returns A promise that resolves to the file path and extension
 */
const getFileFromS3 = async (
  orgId: string,
  fileName: string,
): Promise<{
  filePath: string;
  fileExtension: string | undefined;
}> => {
  const fileExtension = getFileExtension(fileName);

  if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
  }

  const fileTmpPath = path.join(TMP_DIR, `${uuidv4()}.${fileExtension}`);

  await getStorageProvider().downloadToFile(
    `${orgId}/${fileName}`,
    fileTmpPath,
  );

  return {
    filePath: fileTmpPath,
    fileExtension,
  };
};

/**
 * Streams a file from storage to a specific local path.
 * Creates parent directories if needed. Overwrites any existing file at destPath.
 */
const downloadToLocalFile = async (
  orgId: string,
  s3FileName: string,
  destPath: string,
): Promise<void> => {
  await getStorageProvider().downloadToFile(`${orgId}/${s3FileName}`, destPath);
};

const uploadRaw = async (s3Key: string, fileContent: Buffer) => {
  await getStorageProvider().upload(s3Key, fileContent);
};

export const aws = {
  uploadToS3,
  uploadRaw,
  deleteFromS3,
  getFileFromS3,
  downloadToLocalFile,
};
