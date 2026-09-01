import { getOrgIdFromAuthOrThrow as getOrgIdOrThrow } from '../utils/auth-helpers';
import { getStorageProvider } from '@/libs/storage';

async function getOrgId(): Promise<string> {
  return await getOrgIdOrThrow();
}

export async function uploadToS3(fileName: string, fileContent: Buffer) {
  const orgId = await getOrgId();
  await getStorageProvider().upload(`${orgId}/${fileName}`, fileContent);
}

export async function uploadToS3WithOrg(
  orgId: string,
  fileName: string,
  fileContent: Buffer,
) {
  await getStorageProvider().upload(`${orgId}/${fileName}`, fileContent);
}

export async function deleteFromS3(fileName: string) {
  const orgId = await getOrgId();
  await getStorageProvider().delete(`${orgId}/${fileName}`);
}

export async function deleteFromS3ByKey(s3Key: string) {
  await getStorageProvider().delete(s3Key);
}

export async function getFileFromS3(fileName: string): Promise<Buffer> {
  const orgId = await getOrgId();
  return await getStorageProvider().download(`${orgId}/${fileName}`);
}

export async function getFileFromS3ByKey(s3Key: string): Promise<Buffer> {
  return await getStorageProvider().download(s3Key);
}
