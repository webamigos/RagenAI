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

function extractPointsFromScale(
  description: string,
  maxScore: number,
): number[] {
  // Match Polish scale-entry thresholds in any of the common shapes the
  // upstream LLM may produce when parsing the rubric PDF:
  //   "10 pkt:" / "10 pkt -" / "10 punktów:" / "10 punkty -" / "10 pkt –"
  // The number must be at the start of a line or right after a comma /
  // bullet / dash to avoid matching prose like "inne kryteria >75 pkt".
  const matches = [
    ...description.matchAll(
      /(?:^|[\n,•·\-*])\s*(\d+)\s*(?:pkt|punkt(?:y|ów|u|ach)?)\s*[:\-–—]/gim,
    ),
  ];
  const unique = [...new Set(matches.map((m) => parseInt(m[1], 10)))]
    .filter((v) => v >= 0 && v <= maxScore)
    .sort((a, b) => a - b);
  if (unique.length > 0) {
    return unique;
  }
  // No recognizable scale entries — allow the full [0..maxScore] range
  // so the model isn't artificially locked to 0 when the rubric was
  // written or parsed in a non-standard format.
  return Array.from({ length: maxScore + 1 }, (_, i) => i);
}

async function scoreCriterion(
  criterion: ScoringCriterion,
  leadData: Record<string, unknown>,
  model: ReturnType<typeof createChatCompletionInstance>,
): Promise<{ points: number; justification: string }> {
  const allowedPoints = extractPointsFromScale(
    criterion.description,
    criterion.maxScore,
  );
  const criterionSchema = z.object({
    points: z
      .number()
      .int()
      .refine((v) => allowedPoints.includes(v), {
        message: `Must be one of: ${allowedPoints.join(', ')}`,
      }),
    justification: z.string().max(400),
  });

  const { object } = await generateObject({
    model,
    schema: criterionSchema,
    temperature: 0,
    prompt: `Kryterium: ${criterion.label}\nDozwolone wartości punktów: ${allowedPoints.join(', ')} pkt\nSkala oceny:\n${criterion.description}\n\nDane firmy:\n${JSON.stringify(leadData)}\n\nWybierz DOKŁADNIE jedną wartość z listy dozwolonych (${allowedPoints.join('/')}). ZASADA: jeśli danych brakuje → wybierz ${allowedPoints[0]} i napisz "brak danych". Napisz 2 zdania uzasadnienia po polsku: pierwsze opisuje co konkretnie w danych firmy zadecydowało o tej ocenie, drugie wyjaśnia dlaczego nie przyznano wyższej lub niższej liczby punktów.`,
  });
  return object;
}

function aggregateScore(
  criteria: ScoringCriterion[],
  breakdown: Breakdown,
): number {
  // maxScore is the Max column from the document — already encodes the criterion's
  // maximum contribution (e.g. Lokalizacja maxScore=7, Kaloryczność maxScore=15).
  // No weight multiplication — summing maxScore across all criteria yields 100.
  const totalPoints = criteria.reduce(
    (sum, c) => sum + (breakdown[c.key]?.points ?? 0),
    0,
  );
  const totalMax = criteria.reduce((sum, c) => sum + c.maxScore, 0);
  if (totalMax === 0) {
    return 0;
  }
  return Math.min(100, Math.round((totalPoints / totalMax) * 100));
}

function buildJustification(
  criteria: ScoringCriterion[],
  breakdown: Breakdown,
): string {
  const lines = criteria.map((c) => {
    const entry = breakdown[c.key];
    const points = entry?.points ?? 0;
    const justText = entry?.error
      ? 'brak danych'
      : (entry?.justification ?? '');
    return `[${c.label}: ${points}/${c.maxScore} pkt] ${justText}`;
  });

  const totalPoints = criteria.reduce(
    (sum, c) => sum + (breakdown[c.key]?.points ?? 0),
    0,
  );
  const totalMax = criteria.reduce((sum, c) => sum + c.maxScore, 0);
  const finalScore = Math.min(100, Math.round((totalPoints / totalMax) * 100));
  lines.push(
    `\nŁączny wynik: ${totalPoints}/${totalMax} pkt → ${finalScore}/100`,
  );

  return lines.join('\n');
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
