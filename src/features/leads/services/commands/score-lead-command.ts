import { generateObject } from 'ai';
import { z } from 'zod';
import db from '@ragenai/prisma-client';
import { createChatCompletionInstance } from '@/app/lib/services/llm';
import { extractScoringFileText } from '@/features/leads/utils/extract-scoring-file-text';
import {
  markLeadScoringPendingCommand,
  completeLeadScoringCommand,
} from './update-lead-scoring-command';
import { BadRequestException } from '@/libs/utils/errors';
import { logger } from '@/app/lib/utils/logger';

const scoringSchema = z.object({
  score: z.number().int().min(0).max(100),
  justification: z.string().max(500),
});

export type ScoringResult =
  | { status: 'scored'; score: number; justification: string }
  | { status: 'failed'; error: string }
  | { status: 'in_progress' };

export async function scoreLeadCommand(
  leadPublicId: string,
  leadListPublicId: string,
  leadData: Record<string, unknown>,
  organizationId: string,
): Promise<ScoringResult> {
  const list = await db.leadList.findFirst({
    where: { publicId: leadListPublicId, organizationId },
    select: {
      scoringFile: {
        select: {
          fileName: true,
          fileType: true,
          fileExtension: true,
          organizationId: true,
        },
      },
    },
  });

  if (!list?.scoringFile) {
    throw new BadRequestException('No scoring file attached to this list');
  }

  const claimed = await markLeadScoringPendingCommand(
    leadPublicId,
    organizationId,
  );
  if (!claimed) {
    return { status: 'in_progress' };
  }

  try {
    const criteriaText = await extractScoringFileText(list.scoringFile);
    const model = createChatCompletionInstance({
      model: process.env.DEFAULT_MODEL ?? 'gpt-5.4',
    });

    const { object } = await generateObject({
      model,
      schema: scoringSchema,
      system:
        'You are a lead scoring assistant. Use the provided scoring criteria to evaluate the company data. Return a score (0–100) and a short justification (max 2 sentences, same language as the criteria document).',
      prompt: `Scoring criteria:\n\n${criteriaText}\n\n---\n\nCompany data:\n\n${JSON.stringify(leadData, null, 2)}`,
    });

    await completeLeadScoringCommand(leadPublicId, organizationId, {
      ok: true,
      score: object.score,
      justification: object.justification,
    });
    return {
      status: 'scored',
      score: object.score,
      justification: object.justification,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'scoring failed';
    logger.error({ err: error, leadPublicId }, 'scoreLeadCommand failed');
    await completeLeadScoringCommand(leadPublicId, organizationId, {
      ok: false,
      error: message,
    });
    return { status: 'failed', error: message };
  }
}
