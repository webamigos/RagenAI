import { generateObject } from 'ai';
import { z } from 'zod';
import db from '@ragenai/prisma-client';
import { createChatCompletionInstance } from '@/app/lib/services/llm';
import { logger } from '@/app/lib/utils/logger';

const parsedCriteriaSchema = z.object({
  criteria: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      description: z.string(),
      maxScore: z.number(),
      weight: z.number(),
    }),
  ),
  disqualifiers: z.array(z.string()),
});

export async function parseScoringCriteriaCommand(
  criteriaText: string,
  organizationId: string,
  leadListPublicId: string,
): Promise<void> {
  const list = await db.leadList.findFirst({
    where: { publicId: leadListPublicId, organizationId },
    select: { id: true },
  });
  if (!list) {
    return;
  }

  try {
    const model = createChatCompletionInstance({
      model: process.env.DEFAULT_MODEL ?? 'gpt-5.4',
    });
    const { object } = await generateObject({
      model,
      schema: parsedCriteriaSchema,
      temperature: 0,
      system:
        'You are a scoring rubric parser. Extract all scoring criteria from the document. ' +
        'For each criterion return: a unique snake_case key, a label, the full scoring scale ' +
        'as description, the maximum points, and the weight multiplier (default 1.0 if not stated). ' +
        'Also extract any automatic disqualifiers as a string array. ' +
        'Return only what is explicitly stated in the document.',
      prompt: criteriaText,
    });

    await db.leadList.update({
      where: { id: list.id },
      data: {
        scoringCriteria: object.criteria,
        scoringDisqualifiers: object.disqualifiers,
        scoringCriteriaError: null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'parsing failed';
    logger.error(
      { err: error, leadListPublicId },
      'parseScoringCriteriaCommand failed',
    );
    await db.leadList.update({
      where: { id: list.id },
      data: { scoringCriteriaError: message },
    });
  }
}
