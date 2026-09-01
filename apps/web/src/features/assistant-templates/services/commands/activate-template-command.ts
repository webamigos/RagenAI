'use server';

import db from '@ragenai/prisma-client';
import { trackAudit } from '@/features/audit-logs/services/commands/create-audit-log-command';
import { isFeatureEnabledQuery } from '@/features/subscriptions/services/queries/get-effective-features-query';
import { UnauthorizedException } from '@/libs/utils/errors';

export async function activateTemplateCommand(
  templatePublicId: string,
  organizationId: string,
  userId: string,
): Promise<{ projectId: string }> {
  const canUseTemplates = await isFeatureEnabledQuery(
    organizationId,
    'customAssistantTemplates',
  );
  if (!canUseTemplates) {
    throw new UnauthorizedException(
      'Custom assistant templates are not enabled for your organization plan',
    );
  }

  const template = await db.assistantTemplate.findUnique({
    where: { id: templatePublicId },
  });

  if (!template) {
    throw new Error('Template not found');
  }

  // Check if project already exists for this template + org
  const existing = await db.project.findFirst({
    where: { templateId: template.id, organizationId },
    select: { id: true },
  });

  if (existing) {
    return { projectId: existing.id };
  }

  // Create new project from template
  const project = await db.project.create({
    data: {
      title: template.name,
      organizationId,
      ownerId: userId,
      templateId: template.id,
    },
  });

  trackAudit({
    action: 'assistant_template.activated',
    entityType: 'project',
    entityId: project.id,
    newData: { templateId: templatePublicId, templateName: template.name },
  });

  return { projectId: project.id };
}
