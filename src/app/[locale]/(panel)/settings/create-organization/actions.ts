'use server';

import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { requireAppAdmin } from '@/lib/auth-guards';
import { createOrganizationWithDefaultProjectCommand } from '@/features/organizations/services/commands/create-organization-command';
import { ensureLiteLLMTeamCommand } from '@/features/organizations/services/commands/litellm-team-command';
import db from '@ragenai/prisma-client';

export async function createOrganizationAction(name: string, slug: string) {
  const adminUser = await requireAppAdmin();

  // createOrganization with authenticated headers automatically adds
  // the calling user as owner — no need for a separate addMember call
  const org = await auth.api.createOrganization({
    body: { name, slug },
    headers: await headers(),
  });

  if (!org?.id) {
    throw new Error('Failed to create organization');
  }

  // Create default project
  await createOrganizationWithDefaultProjectCommand(org.id, adminUser.id);

  // Create LiteLLM team + virtual key
  try {
    await ensureLiteLLMTeamCommand(org.id, name);
  } catch {
    // Best-effort — team can be provisioned later via migration script
  }

  // Set default vector store (merge with existing metadata)
  const defaultVectorStore = process.env.DEFAULT_VECTOR_STORE || 'qdrant';
  const existingOrg = await db.organization.findUnique({
    where: { id: org.id },
    select: { metadata: true },
  });
  await db.organization.update({
    where: { id: org.id },
    data: {
      vectorStore: defaultVectorStore,
      metadata: {
        ...((existingOrg?.metadata as object) ?? {}),
        vector_store: defaultVectorStore,
      },
    },
  });

  // Set the new org as active
  await auth.api.setActiveOrganization({
    body: { organizationId: org.id },
    headers: await headers(),
  });

  return { organizationId: org.id };
}
