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
import type { ScoringCriterion } from '@/features/leads/contracts/lead-list.types';

// ── schemas ───────────────────────────────────────────────────────────────────

const ScoringCriterionSchema = z.object({
  key: z.string(),
  label: z.string(),
  description: z.string(),
  maxScore: z.number(),
  weight: z.number(),
});

function parseCriteria(raw: unknown): ScoringCriterion[] | null {
  if (!raw) {
    return null;
  }
  const result = z.array(ScoringCriterionSchema).safeParse(raw);
  return result.success ? result.data : null;
}

// ── types ─────────────────────────────────────────────────────────────────────

export type ScoringResult =
  | { status: 'scored'; score: number; justification: string }
  | { status: 'failed'; error: string }
  | { status: 'in_progress' };

type Breakdown = Record<
  string,
  { points: number; justification: string; error?: boolean }
>;

// ── llm schemas ───────────────────────────────────────────────────────────────

const singlePromptSchema = z.object({
  score: z.number().int().min(0).max(100),
  justification: z.string().max(500),
});

const disqualifierSchema = z.object({
  isDisqualified: z.boolean(),
  reason: z.string().max(300),
});

// ── helpers ───────────────────────────────────────────────────────────────────

async function scoreLeadSinglePrompt(
  leadPublicId: string,
  organizationId: string,
  leadData: Record<string, unknown>,
  criteriaText: string,
): Promise<ScoringResult> {
  const model = createChatCompletionInstance({
    model: process.env.DEFAULT_MODEL ?? 'gpt-5.4',
  });

  const { object } = await generateObject({
    model,
    schema: singlePromptSchema,
    temperature: 0,
    system:
      'You are a lead scoring assistant. Use the provided scoring criteria to evaluate the company data. Return a score (0–100) and a short justification (max 2 sentences). Always write the justification in Polish.',
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
}

async function checkDisqualifiers(
  disqualifiers: string[],
  leadData: Record<string, unknown>,
  model: ReturnType<typeof createChatCompletionInstance>,
): Promise<{ isDisqualified: boolean; reason: string }> {
  const { object } = await generateObject({
    model,
    schema: disqualifierSchema,
    temperature: 0,
    system:
      'Check whether the company data matches any of the listed disqualifiers. Return isDisqualified: true and a short reason in Polish if any disqualifier matches.',
    prompt: `Disqualifiers:\n${disqualifiers.map((d, i) => `${i + 1}. ${d}`).join('\n')}\n\nCompany data:\n${JSON.stringify(leadData, null, 2)}`,
  });
  return object;
}

async function scoreCriterion(
  criterion: ScoringCriterion,
  leadData: Record<string, unknown>,
  model: ReturnType<typeof createChatCompletionInstance>,
): Promise<{ points: number; justification: string }> {
  const criterionSchema = z.object({
    points: z.number().int().min(0).max(criterion.maxScore),
    justification: z.string().max(200),
  });

  const { object } = await generateObject({
    model,
    schema: criterionSchema,
    temperature: 0,
    prompt: `Kryterium: ${criterion.label}\nSkala oceny: ${criterion.description}\nMaksimum: ${criterion.maxScore} pkt\n\nDane firmy:\n${JSON.stringify(leadData)}\n\nPrzyznaj punkty (liczba całkowita od 0 do ${criterion.maxScore}) i napisz 1 zdanie uzasadnienia po polsku.`,
  });
  return object;
}

function aggregateScore(
  criteria: ScoringCriterion[],
  breakdown: Breakdown,
): number {
  const rawScore = criteria.reduce(
    (sum, c) => sum + c.weight * (breakdown[c.key]?.points ?? 0),
    0,
  );
  const maxRaw = criteria.reduce((sum, c) => sum + c.weight * c.maxScore, 0);
  if (maxRaw === 0) {
    return 0;
  }
  return Math.round((rawScore / maxRaw) * 100);
}

function buildJustification(
  criteria: ScoringCriterion[],
  breakdown: Breakdown,
): string {
  const scored = criteria
    .filter((c) => !breakdown[c.key]?.error)
    .map((c) => ({
      criterion: c,
      entry: breakdown[c.key],
      ratio: (breakdown[c.key]?.points ?? 0) / c.maxScore,
    }));

  if (scored.length === 0) {
    return '';
  }

  scored.sort((a, b) => b.ratio - a.ratio);
  const best = scored[0];
  const worst = scored[scored.length - 1];

  const parts = [best.entry?.justification ?? ''];
  if (worst !== best && worst.entry?.justification) {
    parts.push(worst.entry.justification);
  }
  return parts.join(' ').trim();
}

// ── main command ──────────────────────────────────────────────────────────────

export async function scoreLeadCommand(
  leadPublicId: string,
  leadListPublicId: string,
  leadData: Record<string, unknown>,
  organizationId: string,
): Promise<ScoringResult> {
  const list = await db.leadList.findFirst({
    where: { publicId: leadListPublicId, organizationId },
    select: {
      scoringCriteria: true,
      scoringDisqualifiers: true,
      scoringFile: {
        select: {
          id: true,
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
    const rawCriteria = parseCriteria(list.scoringCriteria);

    if (!rawCriteria || rawCriteria.length === 0) {
      logger.warn(
        { leadPublicId },
        'scoringCriteria missing, using single-prompt fallback',
      );
      const criteriaText = await extractScoringFileText(list.scoringFile);
      return await scoreLeadSinglePrompt(
        leadPublicId,
        organizationId,
        leadData,
        criteriaText,
      );
    }

    const criteria = rawCriteria;
    const rawDisqualifiers = list.scoringDisqualifiers as string[] | null;
    const model = createChatCompletionInstance({
      model: process.env.DEFAULT_MODEL ?? 'gpt-5.4',
    });

    if (rawDisqualifiers && rawDisqualifiers.length > 0) {
      const { isDisqualified, reason } = await checkDisqualifiers(
        rawDisqualifiers,
        leadData,
        model,
      );
      if (isDisqualified) {
        const justification = `DYSKWALIFIKACJA: ${reason}`;
        await completeLeadScoringCommand(leadPublicId, organizationId, {
          ok: true,
          score: 0,
          justification,
        });
        return { status: 'scored', score: 0, justification };
      }
    }

    const results = await Promise.allSettled(
      criteria.map((criterion) => scoreCriterion(criterion, leadData, model)),
    );

    const breakdown: Breakdown = {};
    for (let i = 0; i < criteria.length; i++) {
      const criterion = criteria[i];
      const result = results[i];
      if (result.status === 'fulfilled') {
        breakdown[criterion.key] = result.value;
      } else {
        breakdown[criterion.key] = {
          points: 0,
          justification: '',
          error: true,
        };
      }
    }

    const allFailed = Object.values(breakdown).every((b) => b.error);
    if (allFailed) {
      throw new Error('All criterion scoring calls failed');
    }

    const finalScore = aggregateScore(criteria, breakdown);
    const justification = buildJustification(criteria, breakdown);

    await completeLeadScoringCommand(leadPublicId, organizationId, {
      ok: true,
      score: finalScore,
      justification,
    });
    return { status: 'scored', score: finalScore, justification };
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
