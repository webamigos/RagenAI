import {
  S3Client,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getOrgIdFromAuthOrThrow as getOrgIdOrThrow } from '../utils/auth-helpers';

export const getAwsClient = () => {
  return new S3Client({
    endpoint: process.env.AWS_ENDPOINT_URL,
    region: process.env.AWS_DEFAULT_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });
};

async function getOrgId(): Promise<string> {
  return await getOrgIdOrThrow();
}

// function uses AWS SDK v3 and we can use parallelUploads and streaming in the future
export async function uploadToS3(fileName: string, fileContent: Buffer) {
  const orgId = await getOrgId();

  const parallelUploads3 = new Upload({
    client: getAwsClient(),
    params: {
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: `${orgId}/${fileName}`,
      Body: fileContent,
    },
  });

  return await parallelUploads3.done();
}

export async function uploadToS3WithOrg(
  orgId: string,
  fileName: string,
  fileContent: Buffer,
) {
  const parallelUploads3 = new Upload({
    client: getAwsClient(),
    params: {
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: `${orgId}/${fileName}`,
      Body: fileContent,
    },
  });

  return await parallelUploads3.done();
}

export async function deleteFromS3(fileName: string) {
  const orgId = await getOrgId();
  await getAwsClient().send(
    new DeleteObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: `${orgId}/${fileName}`,
    }),
  );
}

export async function deleteFromS3ByKey(s3Key: string) {
  await getAwsClient().send(
    new DeleteObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: s3Key,
    }),
  );
}

export async function getFileFromS3(fileName: string): Promise<Buffer> {
  const orgId = await getOrgId();
  return await getFileFromS3ByKey(`${orgId}/${fileName}`);
}

export async function getFileFromS3ByKey(s3Key: string): Promise<Buffer> {
  const command = new GetObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: s3Key,
  });

  const response = await getAwsClient().send(command);

  if (!response.Body) {
    throw new Error(`No content found for key: ${s3Key}`);
  }

  const chunks: Uint8Array[] = [];
  for await (const chunk of response.Body as any) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}
