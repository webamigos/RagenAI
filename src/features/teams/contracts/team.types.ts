export type TeamListItem = {
  id: string;
  name: string;
  memberCount: number;
  createdAt: Date;
};

export type TeamSettings = {
  id: string;
  name: string;
  organizationId: string;
  budgetUsdCents: number;
  budgetDuration: string;
  rpmLimit: number | null;
  tpmLimit: number | null;
  allowedModels: string[];
  litellmProvisioned: boolean;
};

export type UpdateTeamSettingsInput = {
  name?: string;
  budgetUsdCents?: number;
  budgetDuration?: string;
  rpmLimit?: number | null;
  tpmLimit?: number | null;
  allowedModels?: string[];
};

export type TeamUsage = {
  teamId: string;
  spendUsd: number;
  tokenCount: number;
  requestCount: number;
  budgetUsdCents: number;
  budgetDuration: string;
  pctOfBudget: number;
  windowStart: string;
  windowEnd: string;
};

export type TeamDetails = {
  id: string;
  name: string;
  organizationId: string;
  members: TeamMemberItem[];
  createdAt: Date;
};

export type TeamMemberItem = {
  id: string;
  userId: string;
  userName: string | null;
  userEmail: string;
  userImage: string | null;
  joinedAt: Date;
};
