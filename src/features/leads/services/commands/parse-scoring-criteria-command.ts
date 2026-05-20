import { generateObject } from 'ai';
import { z } from 'zod';
import db from '@ragenai/prisma-client';
import { Prisma } from '@/generated/prisma/client';
import { createChatCompletionInstance } from '@/app/lib/services/llm';
import { logger } from '@/app/lib/utils/logger';
import { NotFoundException } from '@/libs/utils/errors';

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
    throw new NotFoundException('Lead list not found');
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
        'You are a scoring rubric parser. Extract all scoring criteria from the document.\n' +
        'For each criterion return:\n' +
        '- key: unique snake_case identifier\n' +
        '- label: short criterion name\n' +
        '- description: COPY the FULL point scale verbatim from the document — every score level with its exact point value and description (e.g. "10 pkt: Large corporation... 8 pkt: Medium company... 4 pkt: Small firm... 1 pkt: Startup"). Do NOT summarize or paraphrase. This must contain all point thresholds.\n' +
        '- maxScore: maximum points for this criterion (the number after the × weight column)\n' +
        '- weight: the weight multiplier (the ×N.N value; default 1.0 if not stated)\n' +
        'Also extract any automatic disqualifiers as a string array.\n' +
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
      data: {
        scoringCriteria: Prisma.JsonNull,
        scoringDisqualifiers: Prisma.JsonNull,
        scoringCriteriaError: message,
      },
    });
  }
}
