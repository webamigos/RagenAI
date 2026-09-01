import { log, proxyActivities } from '@temporalio/workflow';
import { ApplicationFailure } from '@temporalio/common';

import type * as activities from '../activities';

type GenerateDocumentPayload = {
  templateName: string;
  rawInput: Record<string, unknown>;
  clientName: string;
  driveFolderId: string;
  driveAccessToken: string;
  orgId: string;
  userId: string;
  userEmail: string;
};

type GenerateDocumentResult = {
  fileId: string;
  fileUrl: string;
  fileName: string;
};

export async function generateDocument(
  payload: GenerateDocumentPayload,
): Promise<GenerateDocumentResult> {
  const { generateDocumentContent } = proxyActivities<typeof activities>({
    retry: {
      initialInterval: '2 seconds',
      maximumInterval: '1 minute',
      backoffCoefficient: 2,
      maximumAttempts: 3,
    },
    startToCloseTimeout: '3 minutes',
  });

  const { createDocxFile, sendSuccessNotification } = proxyActivities<
    typeof activities
  >({
    retry: {
      initialInterval: '1 second',
      maximumInterval: '30 seconds',
      backoffCoefficient: 2,
      maximumAttempts: 5,
    },
    startToCloseTimeout: '1 minute',
  });

  const { uploadToGoogleDrive } = proxyActivities<typeof activities>({
    retry: {
      maximumAttempts: 1,
    },
    startToCloseTimeout: '1 minute',
  });

  const {
    templateName,
    rawInput,
    clientName,
    driveFolderId,
    driveAccessToken,
    orgId,
  } = payload;

  // Step 1: Generate document content via LLM
  let sections;
  try {
    sections = await generateDocumentContent({
      templateName,
      rawInput,
      clientName,
      orgId,
    });
  } catch (error) {
    throw new ApplicationFailure(
      `Document content generation failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // Step 2: Create DOCX file
  let docxBase64: string;
  try {
    docxBase64 = await createDocxFile({
      sections,
      clientName,
      templateName,
    });
  } catch (error) {
    throw new ApplicationFailure(
      `DOCX file creation failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // Step 3: Upload to Google Drive
  const fileName = `${clientName} — Workshop Summary.docx`;
  let uploadResult;
  try {
    uploadResult = await uploadToGoogleDrive({
      docxBase64,
      fileName,
      driveFolderId,
      driveAccessToken,
    });
  } catch (error) {
    throw new ApplicationFailure(
      `Google Drive upload failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // Step 4: Send success notification
  try {
    await sendSuccessNotification({
      content: 'Document generated and uploaded to Google Drive',
      intlKey: 'document-generated',
      meta: {
        forceRefresh: true,
      },
    });
  } catch (error) {
    log.warn('Failed to send success notification', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return {
    fileId: uploadResult.fileId,
    fileUrl: uploadResult.fileUrl,
    fileName: uploadResult.fileName,
  };
}
