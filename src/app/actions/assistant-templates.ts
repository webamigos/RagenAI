'use server';

import { getActiveTemplatesQuery } from '@/features/assistant-templates/services/queries/get-active-templates-query';
import { activateTemplateCommand } from '@/features/assistant-templates/services/commands/activate-template-command';
import type { AssistantTemplateUserView } from '@/features/assistant-templates/contracts/assistant-template.types';
import {
  getOrgIdFromAuthOrThrow,
  getOrgIdFromAuth,
  getCurrentUserId,
} from '@/app/lib/utils/auth-helpers';
import {
  getDefaultAllowedTemplates,
  getAllowedTemplates,
} from '@/features/organizations/services/organization-settings';

export async function getActiveTemplatesAction(): Promise<
  AssistantTemplateUserView[]
> {
  let templates = await getActiveTemplatesQuery();

  const orgId = await getOrgIdFromAuth();
  if (orgId) {
    const [appAllowed, orgAllowed] = await Promise.all([
      getDefaultAllowedTemplates(),
      getAllowedTemplates(orgId),
    ]);

    if (appAllowed.length > 0) {
      templates = templates.filter((t) => appAllowed.includes(t.id));
    }

    if (orgAllowed.length > 0) {
      templates = templates.filter((t) => orgAllowed.includes(t.id));
    }
  }

  return templates;
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
