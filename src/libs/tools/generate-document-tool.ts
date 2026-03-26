import { z } from 'zod';
import { nanoid } from 'nanoid';
import { ragenAuthClient } from '@/libs/ragen-vault/client';
import { getTemporalClient, TASK_QUEUE_NAME } from '@/libs/temporal';
import { Workflow } from '@/features/documents/contracts/document.types';
import { logger } from '@/app/lib/utils/logger';

const GOOGLE_DRIVE_PROVIDER = 'GOOGLE_DRIVE';

type GenerateDocumentToolContext = {
  orgId: string;
  userId: string;
  userEmail: string;
};

type GenerateDocumentToolResult = {
  success: boolean;
  workflowId: string | null;
  message: string;
};

const generateDocumentSchema = z.object({
  templateName: z
    .enum(['workshop-summary'])
    .describe('The document template to use'),
  rawInput: z
    .string()
    .min(1)
    .describe(
      'The raw workshop notes, transcript, or content to generate the document from',
    ),
  clientName: z
    .string()
    .min(1)
    .max(200)
    .describe('Client or project name used in the document title'),
  driveFolderId: z
    .string()
    .min(1)
    .describe(
      'Google Drive folder ID where the generated document will be uploaded',
    ),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createGenerateDocumentTool(
  ctx: GenerateDocumentToolContext,
): any {
  const execute = async ({
    templateName,
    rawInput,
    clientName,
    driveFolderId,
  }: z.infer<
    typeof generateDocumentSchema
  >): Promise<GenerateDocumentToolResult> => {
    const customerId = `${ctx.orgId}:${ctx.userId}:${GOOGLE_DRIVE_PROVIDER.toLowerCase()}`;

    let driveAccessToken: string;
    try {
      const tokenData = await ragenAuthClient.getToken(
        customerId,
        GOOGLE_DRIVE_PROVIDER,
      );
      driveAccessToken = tokenData.accessToken;
    } catch (error) {
      logger.error(
        { err: error },
        'Failed to fetch Google Drive token for document generation',
      );
      return {
        success: false,
        workflowId: null,
        message:
          'Google Drive is not connected. Please ask the user to connect Google Drive in Settings > Connectors before generating documents.',
      };
    }

    const workflowId = `docgen-${ctx.orgId}-${nanoid()}`;

    try {
      const client = getTemporalClient();
      await client.workflow.start(Workflow.GENERATE_DOCUMENT, {
        workflowId,
        taskQueue: TASK_QUEUE_NAME,
        args: [
          {
            templateName,
            rawInput: { content: rawInput },
            clientName,
            driveFolderId,
            driveAccessToken,
            orgId: ctx.orgId,
            userId: ctx.userId,
            userEmail: ctx.userEmail,
          },
        ],
      });
    } catch (error) {
      logger.error(
        { err: error },
        'Failed to start document generation workflow',
      );
      return {
        success: false,
        workflowId: null,
        message: 'Failed to start document generation. Please try again later.',
      };
    }

    return {
      success: true,
      workflowId,
      message:
        'Document generation has been started. The DOCX file will be uploaded to the specified Google Drive folder once ready. ' +
        `Workflow ID: ${workflowId}`,
    };
  };

  return {
    description:
      'Generate a professional DOCX document from workshop notes or transcript. ' +
      'The document is created asynchronously and uploaded to a specified Google Drive folder. ' +
      'Returns a workflow ID that can be used to check generation status.',
    parameters: generateDocumentSchema,
    execute,
  };
}
