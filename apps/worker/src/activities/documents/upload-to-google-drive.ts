import type {
  UploadToGoogleDriveParams,
  UploadToGoogleDriveResult,
} from './docgen-types';

const DRIVE_UPLOAD_URL =
  'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink';

export async function uploadToGoogleDrive(
  params: UploadToGoogleDriveParams,
): Promise<UploadToGoogleDriveResult> {
  const boundary = `----DocGenBoundary${Date.now()}`;
  const mimeType =
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  const metadata = JSON.stringify({
    name: params.fileName,
    parents: [params.driveFolderId],
    mimeType,
  });

  // Build multipart/related body
  const bodyParts = [
    `--${boundary}\r\n`,
    'Content-Type: application/json; charset=UTF-8\r\n\r\n',
    metadata,
    `\r\n--${boundary}\r\n`,
    `Content-Type: ${mimeType}\r\n`,
    'Content-Transfer-Encoding: base64\r\n\r\n',
    params.docxBase64,
    `\r\n--${boundary}--`,
  ];

  const body = bodyParts.join('');

  const response = await fetch(DRIVE_UPLOAD_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.driveAccessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Google Drive upload failed (${response.status}): ${errorText}`,
    );
  }

  const data = (await response.json()) as {
    id: string;
    name: string;
    webViewLink?: string;
  };

  return {
    fileId: data.id,
    fileUrl:
      data.webViewLink || `https://drive.google.com/file/d/${data.id}/view`,
    fileName: data.name,
  };
}
