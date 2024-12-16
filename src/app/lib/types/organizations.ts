import { Organization } from '@prisma/client';

export type OrganizationVectorStore = 'qdrant' | 'supabase';

export type ClerkOrganizationPrivateMetadata = {
  ragen_org_id: Organization['id'];
  vector_store: OrganizationVectorStore;
};

export type ClerkOrganizationPublicMetadata = {
  hasKnowledge: boolean;
  subscription?: {
    plan: {
      name: string;
      type: string;
    };
    status: string;
    current_period_start: Date;
    current_period_end: Date;
    trial_end: Date | null;
  };
};

export type ClerkOrganizationMetadata = {
  publicMetadata?: ClerkOrganizationPublicMetadata;
  privateMetadata?: ClerkOrganizationPrivateMetadata;
};
