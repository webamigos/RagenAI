import { Organization } from '@prisma/client';

export type OrganizationVectorStore = 'qdrant' | 'supabase';

export type ClerkOrganizationPrivateMetadata = {
  ragen_org_id: Organization['id'];
  vector_store: OrganizationVectorStore;
};

export type ClerkOrganizationPublicMetadata = {
  hasKnowledge: boolean;
};

export type ClerkOrganizationMetadata = {
  publicMetadata?: ClerkOrganizationPublicMetadata;
  privateMetadata?: ClerkOrganizationPrivateMetadata;
};
