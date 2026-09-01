import { logger } from '@/app/lib/utils/logger';
import { resolveLiteLLMKeyQuery } from '@/features/teams/services/queries/resolve-litellm-key-query';

type Input = {
  orgId: string;
  userId: string;
  /** Optional team id propagated via `x-ragen-team-id`. */
  teamId?: string;
  /** Route identifier used in the log entry (e.g. 'v1.chat.completions'). */
  routeTag: string;
};

type Output = {
  apiKey: string | undefined;
  teamId: string | null;
  source: 'team' | 'org' | 'master';
};

/**
 * Shared key-resolution + structured-log helper for the external OpenAI-compat
 * endpoints. Keeps `{ requestedTeamId, resolvedTeamId, keySource }` emitted
 * the same way whether the caller hits `/v1/chat` or `/v1/chat/completions`.
 */
export async function resolveLiteLLMKeyForRequest({
  orgId,
  userId,
  teamId,
  routeTag,
}: Input): Promise<Output> {
  const resolution = await resolveLiteLLMKeyQuery({
    orgId,
    userId,
    activeTeamId: teamId,
  });

  logger.info(
    {
      orgId,
      userId,
      requestedTeamId: teamId ?? null,
      resolvedTeamId: resolution?.teamId ?? null,
      keySource: resolution?.source ?? 'master',
    },
    `Resolved LiteLLM key for ${routeTag}`,
  );

  return {
    apiKey: resolution?.apiKey,
    teamId: resolution?.teamId ?? null,
    source: resolution?.source ?? 'master',
  };
}
