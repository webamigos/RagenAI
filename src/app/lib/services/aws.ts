import {
  S3Client,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getOrgIdOrThrow } from './clerk';

export const getAwsClient = () => {
  return new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });
};

// function uses AWS SDK v3 and we can use parallelUploads and streaming in the future
export async function uploadToS3(fileName: string, fileContent: Buffer) {
  const orgId = getOrgIdOrThrow();

  const parallelUploads3 = new Upload({
    client: getAwsClient(),
    params: {
      Bucket: process.env.AWS_DOCUMENTS_BUCKET,
      Key: `${orgId}/${fileName}`,
      Body: fileContent,
    },
  });

  return await parallelUploads3.done();
}

export async function deleteFromS3(fileName: string) {
  const orgId = getOrgIdOrThrow();
  await getAwsClient().send(
    new DeleteObjectCommand({
      Bucket: process.env.AWS_DOCUMENTS_BUCKET,
      Key: `${orgId}/${fileName}`,
    })
  );
}

/**
 * Retrieves file content from S3
 * @param fileName - The name of the file to retrieve
 * @returns A promise that resolves to the file content as a Buffer
 */
export async function getFileFromS3(fileName: string): Promise<Buffer> {
  const orgId = getOrgIdOrThrow();

  const command = new GetObjectCommand({
    Bucket: process.env.AWS_DOCUMENTS_BUCKET,
    Key: `${orgId}/${fileName}`,
  });

  const response = await getAwsClient().send(command);

  if (!response.Body) {
    throw new Error(`No content found for file: ${fileName}`);
  }

  // Convert the readable stream to a buffer
  const chunks: Uint8Array[] = [];
  for await (const chunk of response.Body as any) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}
