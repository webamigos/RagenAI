// --- Team Management ---

export type LiteLLMTeamCreateParams = {
  teamId: string;
  teamAlias: string;
  maxBudget?: number | null;
  budgetDuration?: string | null;
  models?: string[];
  tpmLimit?: number | null;
  rpmLimit?: number | null;
};

export type LiteLLMTeamUpdateParams = {
  teamId: string;
  maxBudget?: number | null;
  budgetDuration?: string | null;
  models?: string[];
  tpmLimit?: number | null;
  rpmLimit?: number | null;
};

export type LiteLLMTeamInfo = {
  team_id: string;
  team_alias: string | null;
  max_budget: number | null;
  budget_duration: string | null;
  spend: number;
  tpm_limit: number | null;
  rpm_limit: number | null;
  models: string[];
  members_with_roles: Array<{
    user_id: string;
    role: string;
  }>;
};

// --- Key Management ---

export type LiteLLMKeyGenerateParams = {
  teamId: string;
  keyAlias?: string;
  models?: string[];
  maxBudget?: number | null;
};

export type LiteLLMKeyInfo = {
  key: string;
  token: string;
  key_alias: string | null;
  team_id: string | null;
  max_budget: number | null;
  spend: number;
  models: string[];
};

// --- Spend Logs ---

export type LiteLLMSpendLogsParams = {
  teamId: string;
  startDate?: string;
  endDate?: string;
};

export type LiteLLMSpendLog = {
  request_id: string;
  call_type: string;
  model: string;
  spend: number;
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
  startTime: string;
  endTime: string;
  user: string | null;
  team_id: string | null;
  /** Sensitive: may contain API key hash. Mask/redact before displaying or logging. */
  api_key: string | null;
  metadata: Record<string, unknown> | null;
};
