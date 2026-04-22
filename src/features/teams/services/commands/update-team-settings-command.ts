import db from '@ragenai/prisma-client';
import { NotFoundException } from '@/libs/utils/errors';
import { updateLiteLLMForTeamCommand } from './update-litellm-team-command';
import type {
  TeamSettings,
  UpdateTeamSettingsInput,
} from '../../contracts/team.types';

const VALID_BUDGET_DURATIONS = new Set(['7d', '30d', '90d', '1y']);

/**
 * Update a team's budget / rate limits / allowed-models whitelist and sync
 * the change to LiteLLM. Scoped by `organizationId` to prevent cross-org
 * mutations from a compromised session. Bypasses Better Auth's updateTeam
 * endpoint because those fields are Ragen-only — afterUpdateTeam hook only
 * fires for Better Auth's managed fields, so we call the LiteLLM sync
 * directly here.
 */
export async function updateTeamSettingsCommand(
  teamId: string,
  organizationId: string,
  input: UpdateTeamSettingsInput,
): Promise<TeamSettings> {
  if (
    input.budgetDuration != null &&
    !VALID_BUDGET_DURATIONS.has(input.budgetDuration)
  ) {
    throw new Error(`Invalid budgetDuration: ${input.budgetDuration}`);
  }
  if (input.budgetUsdCents != null && input.budgetUsdCents < 0) {
    throw new Error('budgetUsdCents must be non-negative');
  }
  if (input.rpmLimit != null && input.rpmLimit < 0) {
    throw new Error('rpmLimit must be non-negative');
  }
  if (input.tpmLimit != null && input.tpmLimit < 0) {
    throw new Error('tpmLimit must be non-negative');
  }

  const existing = await db.team.findFirst({
    where: { id: teamId, organizationId },
    select: { id: true },
  });

  if (!existing) {
    throw new NotFoundException(`Team not found: ${teamId}`);
  }

  const updated = await db.team.update({
    where: { id: teamId },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.budgetUsdCents !== undefined && {
        budgetUsdCents: input.budgetUsdCents,
      }),
      ...(input.budgetDuration !== undefined && {
        budgetDuration: input.budgetDuration,
      }),
      ...(input.rpmLimit !== undefined && { rpmLimit: input.rpmLimit }),
      ...(input.tpmLimit !== undefined && { tpmLimit: input.tpmLimit }),
      ...(input.allowedModels !== undefined && {
        allowedModels: input.allowedModels,
      }),
    },
  });

  await updateLiteLLMForTeamCommand({ teamId });

  return {
    id: updated.id,
    name: updated.name,
    organizationId: updated.organizationId,
    budgetUsdCents: updated.budgetUsdCents,
    budgetDuration: updated.budgetDuration,
    rpmLimit: updated.rpmLimit,
    tpmLimit: updated.tpmLimit,
    allowedModels: updated.allowedModels,
    litellmProvisioned:
      updated.litellmTeamId != null && updated.litellmKeyToken != null,
  };
}
