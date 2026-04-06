'use server';

import { getActiveTemplatesQuery } from '@/features/assistant-templates/services/queries/get-active-templates-query';
import { activateTemplateCommand } from '@/features/assistant-templates/services/commands/activate-template-command';
import type { AssistantTemplateUserView } from '@/features/assistant-templates/contracts/assistant-template.types';
import {
  getOrgIdFromAuthOrThrow,
  getCurrentUserId,
} from '@/app/lib/utils/auth-helpers';

export async function getActiveTemplatesAction(): Promise<
  AssistantTemplateUserView[]
> {
  return getActiveTemplatesQuery();
}

export async function activateTemplateAction(
  templatePublicId: string,
): Promise<{ projectId: string }> {
  const orgId = await getOrgIdFromAuthOrThrow();
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error('Not authenticated');
  }
  return activateTemplateCommand(templatePublicId, orgId, userId);
}
