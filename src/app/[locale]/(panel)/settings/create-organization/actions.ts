'use server';

import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { requireAppAdmin } from '@/lib/auth-guards';
import { createOrganizationWithDefaultProjectCommand } from '@/features/organizations/services/commands/create-organization-command';
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

  // Set default vector store
  const defaultVectorStore = process.env.DEFAULT_VECTOR_STORE || 'meilisearch';
  await db.organization.update({
    where: { id: org.id },
    data: {
      vectorStore: defaultVectorStore,
      metadata: { vector_store: defaultVectorStore },
    },
  });

  // Set the new org as active
  await auth.api.setActiveOrganization({
    body: { organizationId: org.id },
    headers: await headers(),
  });

  return { organizationId: org.id };
}
