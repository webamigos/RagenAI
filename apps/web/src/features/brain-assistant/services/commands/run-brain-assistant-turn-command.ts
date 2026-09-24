import 'server-only';

import { describeProviderError } from '@ragenai/guardrails';
import { stepCountIs, streamText } from 'ai';

import { AiUsageStep } from '@/generated/prisma/client';
import { getModelProvider, normalizeModelId } from '@/app/components/config';
import {
  createChatCompletionInstance,
  createModerationInstance,
} from '@/app/lib/services/llm';
import { logger } from '@/app/lib/utils/logger';
import { trackAiUsage } from '@/features/ai-usage/services/commands/create-ai-usage-command';
import {
  assertWithinUsageLimits,
  isUsageLimitRefusal,
} from '@/features/ai-usage/services/queries/assert-within-usage-limits';
import { checkUsageLimitsQuery } from '@/features/ai-usage/services/queries/check-usage-limits-query';
import { createOutputGuardrailsCommand } from '@/features/guardrails/services/commands/create-output-guardrails-command';
import { runInputGuardrailsCommand } from '@/features/guardrails/services/commands/run-input-guardrails-command';
import { getOrgGuardrailsQuery } from '@/features/guardrails/services/queries/get-org-guardrails-query';
import {
  getAllowedModels,
  getAllSettings,
} from '@/features/organizations/services/organization-settings';
import {
  assertWithinTeamRateLimit,
  TeamRateLimitError,
} from '@/features/teams/services/queries/check-team-rate-limit-query';
import { resolveUsageTeamQuery } from '@/features/teams/services/queries/resolve-usage-team-query';
import { GuardrailError } from '@/libs/chains/errors';
import { mapFullStream } from '@/libs/chains/utils/stream-mapper';
import { anonymizeWithSecurityEvents } from '@/libs/pii/anonymize-with-security-events';
import { PII_MASKING_LANGUAGE } from '@/libs/pii/masking-language';
import { withPiiSystemInstruction } from '@/libs/pii/pii-system-instruction';
import { StreamUnmasker } from '@/libs/pii/stream-unmasker';

import type {
  BrainAssistantError,
  BrainAssistantEvent,
  BrainProposal,
  BrainScreenContext,
} from '../../contracts/brain-assistant.types';
import { buildBrainAssistantSystemPrompt } from '../../utils/system-prompt';
import { createBrainAssistantTools } from '../queries/brain-assistant-tools';
import { describeScreenQuery } from '../queries/describe-screen-query';
import {
  getBrainAssistantThreadQuery,
  historyForModel,
} from '../queries/get-brain-assistant-threads-query';
import {
  createBrainAssistantThreadCommand,
  storeBrainAssistantAnswerCommand,
  storeBrainAssistantQuestionCommand,
} from './brain-assistant-thread-commands';

/**
 * Tool steps one turn may take. Below chat's `MAX_TOOL_STEPS` (10): this
 * assistant reads a bounded set of Brain rows, and a turn that needs more
 * than eight reads is a question to split.
 */
export const BRAIN_ASSISTANT_MAX_STEPS = 8;

const USAGE_WAIT_MS = 10_000;

/** Separates this assistant's spend on the AI Usage page. */
export const BRAIN_ASSISTANT_USAGE_KIND = 'brain_assistant';

export type BrainAssistantTurn = {
  orgId: string;
  userId: string;
  /** From the session's Brain access; decides whether proposals exist at all. */
  canWrite: boolean;
  /** The caller's active team cookie, for usage attribution and rate limits. */
  activeTeamId: string | null;
  threadId?: string;
  question: string;
  screen: BrainScreenContext;
};

/**
 * One turn of the operator's assistant (spec A3, B1, C1), as a stream of
 * events the route writes line by line.
 *
 * The order is the chat's, and each step is the chat's own function — a
 * second implementation of any of them is how a surface ends up unguarded:
 *
 * 1. **Ceilings first**, before anything is stored or costs anything
 *    (`assertWithinUsageLimits`, then the team's per-minute limit).
 * 2. The question is stored (encrypted), then **PII-masked**; the input
 *    guardrails run on the masked text, as `docs/guardrails.md` requires.
 * 3. The model is the organization's default, narrowed by `allowedModels`.
 * 4. The answer leaves through **`mapFullStream`**, the output funnel every
 *    chat chain uses; a block ends the turn and nothing it held is sent or
 *    stored. Aliases are restored by `StreamUnmasker`, outside the window.
 * 5. Usage is recorded with `metadata.kind = 'brain_assistant'`.
 *
 * Proposals come from the `proposeChange` tool, which exists only for someone
 * who may write; they are sent to the panel as they are accepted and stored
 * with the answer. A refused answer drops its proposals too.
 */
export async function* runBrainAssistantTurnCommand(
  turn: BrainAssistantTurn,
): AsyncGenerator<BrainAssistantEvent> {
  const owner = { orgId: turn.orgId, userId: turn.userId };

  const [usageLimits, settings, allowedModels, usageTeamId, existing] =
    await Promise.all([
      checkUsageLimitsQuery(turn.orgId),
      getAllSettings(turn.orgId),
      getAllowedModels(turn.orgId),
      resolveUsageTeamQuery({
        orgId: turn.orgId,
        userId: turn.userId,
        activeTeamId: turn.activeTeamId,
      }),
      turn.threadId
        ? getBrainAssistantThreadQuery(owner, turn.threadId)
        : Promise.resolve(null),
    ]);

  if (turn.threadId && !existing) {
    yield { type: 'error', code: 'not-found' };
    return;
  }

  try {
    assertWithinUsageLimits(usageLimits, { organizationId: turn.orgId });
    await assertWithinTeamRateLimit({ teamId: usageTeamId });
  } catch (error) {
    yield { type: 'error', code: refusalCode(error) };
    return;
  }

  const threadId =
    existing?.id ??
    (await createBrainAssistantThreadCommand(owner, turn.question));
  yield { type: 'start', threadId };
  await storeBrainAssistantQuestionCommand(owner, threadId, turn.question);

  const model = pickModel(settings.model, allowedModels);
  const provider = getModelProvider(normalizeModelId(model)) || 'openrouter';
  const proposals: BrainProposal[] = [];
  const pending: BrainAssistantEvent[] = [];
  let streamError: unknown = null;

  try {
    const { piiResult } = await anonymizeWithSecurityEvents(
      turn.question,
      PII_MASKING_LANGUAGE,
      { orgId: turn.orgId, userId: turn.userId, threadId },
    );

    const history = historyForModel(existing?.messages ?? []);
    const guardrails = await getOrgGuardrailsQuery(turn.orgId);
    const { question } = await runInputGuardrailsCommand({
      guardrails,
      moderator: createModerationInstance(),
      question: piiResult.maskedText,
      chatHistory: history.map((m) => `${m.role}: ${m.content}`).join('\n'),
      moderateHistory: false,
      organizationId: turn.orgId,
      userId: turn.userId,
      source: 'chat',
      tracking: { organizationId: turn.orgId, userId: turn.userId },
    });

    const system = withPiiSystemInstruction(
      buildBrainAssistantSystemPrompt({
        canWrite: turn.canWrite,
        screen: await describeScreenQuery(turn.orgId, turn.screen),
        today: new Date().toISOString().slice(0, 10),
      }),
      piiResult.aliasMap,
    );

    const tools = createBrainAssistantTools({
      orgId: turn.orgId,
      canWrite: turn.canWrite,
      onProposal: (proposal) => {
        proposals.push(proposal);
        pending.push({ type: 'proposal', proposal });
      },
      onProposalDropped: () => pending.push({ type: 'proposal-dropped' }),
    });

    const result = streamText({
      model: createChatCompletionInstance({
        apiKey: settings.apiKey ?? undefined,
        model,
        temperature: 0.2,
      }),
      system,
      messages: [...history, { role: 'user', content: question }],
      tools,
      stopWhen: stepCountIs(BRAIN_ASSISTANT_MAX_STEPS),
      experimental_telemetry: {
        isEnabled: true,
        functionId: 'brain-assistant-stream',
      },
      onError: ({ error }) => {
        streamError = error;
      },
    });

    const unmasker = new StreamUnmasker(piiResult.aliasMap);
    let text = '';
    let blocked = false;

    for await (const part of mapFullStream(
      result.fullStream,
      createOutputGuardrailsCommand({
        guardrails,
        organizationId: turn.orgId,
        userId: turn.userId,
        source: 'chat',
      }),
    )) {
      if (part.type === 'guardrail-violation') {
        blocked = true;
        break;
      }
      if (part.type === 'text-delta') {
        const delta = unmasker.process(part.textDelta);
        if (delta) {
          text += delta;
          yield { type: 'text', delta };
        }
      } else if (part.type === 'tool-call') {
        yield { type: 'tool', name: part.toolName };
      }
      yield* pending.splice(0);
    }

    if (blocked) {
      await recordUsage(turn, usageTeamId, threadId, provider, model, result);
      const messageId = await storeBrainAssistantAnswerCommand(
        owner,
        threadId,
        '',
        [],
        { refused: true },
      );
      yield { type: 'error', code: 'guardrail' };
      yield { type: 'done', messageId };
      return;
    }

    const rest = unmasker.flush();
    if (rest) {
      text += rest;
      yield { type: 'text', delta: rest };
    }
    yield* pending.splice(0);

    if (streamError && !text && proposals.length === 0) {
      throw streamError;
    }

    await recordUsage(turn, usageTeamId, threadId, provider, model, result);
    const messageId = await storeBrainAssistantAnswerCommand(
      owner,
      threadId,
      text,
      proposals,
    );
    yield { type: 'done', messageId };
  } catch (error) {
    if (error instanceof GuardrailError) {
      yield { type: 'error', code: 'guardrail' };
    } else {
      // Never `{ err }`: a provider error carries the request body, which is
      // the customer's question and Brain's source text
      // (docs/lessons: "a `{ err }` in a structured logger").
      logger.warn(
        {
          orgId: turn.orgId,
          model,
          providerError: describeProviderError(error),
        },
        'Brain assistant turn failed',
      );
      yield { type: 'error', code: providerErrorCode(error) };
    }
    yield { type: 'done', messageId: null };
  }
}

/**
 * The organization's default model, unless `allowedModels` excludes it — then
 * the first allowed one, since the panel has no picker to choose another.
 */
export function pickModel(defaultModel: string, allowed: string[]): string {
  if (allowed.length === 0 || allowed.includes(defaultModel)) {
    return defaultModel;
  }
  return allowed[0]!;
}

function refusalCode(error: unknown): BrainAssistantError {
  if (isUsageLimitRefusal(error)) {
    return 'usage-limit';
  }
  if (error instanceof TeamRateLimitError) {
    return 'rate-limit';
  }
  return 'unknown';
}

/**
 * A provider that rejects the request because of its tools is told apart from
 * one that is down: the first is a configuration the operator can change
 * (a model that cannot call tools), the second is not theirs to fix.
 */
function providerErrorCode(error: unknown): BrainAssistantError {
  const described = describeProviderError(error);
  const message = error instanceof Error ? error.message : '';
  if (described.statusCode === 400 && /tool|function/i.test(message)) {
    return 'no-tools';
  }
  return 'model-unavailable';
}

async function recordUsage(
  turn: BrainAssistantTurn,
  teamId: string | null,
  threadId: string,
  provider: string,
  model: string,
  result: {
    usage: PromiseLike<{
      inputTokens?: number;
      outputTokens?: number;
      totalTokens?: number;
    }>;
  },
): Promise<void> {
  try {
    // Bounded: a turn a guardrail stopped leaves the SDK's stream unread,
    // and a usage promise that never settles must not hold the response.
    const usage = await Promise.race([
      result.usage,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('usage timed out')), USAGE_WAIT_MS),
      ),
    ]);
    await trackAiUsage({
      organizationId: turn.orgId,
      threadId,
      userId: turn.userId,
      teamId,
      step: AiUsageStep.CHAT_COMPLETION,
      provider,
      model,
      inputTokens: usage.inputTokens ?? 0,
      outputTokens: usage.outputTokens ?? 0,
      totalTokens: usage.totalTokens ?? 0,
      metadata: { kind: BRAIN_ASSISTANT_USAGE_KIND },
    });
  } catch (usageError) {
    logger.error(
      { providerError: describeProviderError(usageError) },
      'Failed to track Brain assistant usage',
    );
  }
}
