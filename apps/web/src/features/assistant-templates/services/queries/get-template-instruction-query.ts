import db from '@ragenai/prisma-client';

export async function getTemplateInstructionForProject(
  projectId: string,
): Promise<string | null> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { templateId: true },
  });

  if (!project?.templateId) {
    return null;
  }

  const template = await db.assistantTemplate.findUnique({
    where: { id: project.templateId, isActive: true },
    select: { instructions: true },
  });

  return template?.instructions ?? null;
}
