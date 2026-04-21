import { logger } from '@/app/lib/utils/logger';
import { deleteLiteLLMKey, deleteLiteLLMTeam } from '@/libs/litellm/client';
import { withLiteLLMRetry } from '@/libs/litellm/retry';
import { decryptApiKey } from '@/app/lib/utils/hashApiKey';

type DeprovisionInput = {
  teamId: string;
  litellmTeamId: string | null;
  litellmKeyToken: string | null;
};

/**
 * Revoke the virtual key and delete the LiteLLM team for a Better Auth
 * Team row that is about to be deleted. Called from `beforeDeleteTeam`
 * so the encrypted key is still available.
 *
 * Each remote call is retried with exponential backoff; individual
 * failures are logged but do not block the other cleanup step, because
 * leaving half a tombstone is worse than losing one step.
 */
export async function deprovisionLiteLLMForTeamCommand({
  teamId,
  litellmTeamId,
  litellmKeyToken,
}: DeprovisionInput): Promise<void> {
  if (litellmKeyToken) {
    try {
      const apiKey = decryptApiKey(litellmKeyToken);
      await withLiteLLMRetry('key.delete', { teamId }, () =>
        deleteLiteLLMKey(apiKey),
      );
    } catch (error) {
      logger.error(
        { teamId, err: error },
        'Failed to revoke LiteLLM key during team deprovision',
      );
    }
  }

  if (litellmTeamId) {
    try {
      await withLiteLLMRetry('team.delete', { teamId }, () =>
        deleteLiteLLMTeam(litellmTeamId),
      );
    } catch (error) {
      logger.error(
        { teamId, litellmTeamId, err: error },
        'Failed to delete LiteLLM team during team deprovision',
      );
    }
  }

  logger.info({ teamId }, 'Deprovisioned LiteLLM team');
}
