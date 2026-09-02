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

// --- Team Membership ---

export type LiteLLMTeamMemberAddParams = {
  teamId: string;
  userId: string;
  userEmail?: string;
  role?: 'admin' | 'user';
};

export type LiteLLMTeamMemberRemoveParams = {
  teamId: string;
  userId?: string;
  userEmail?: string;
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

/**
 * `GET /health`. The existing `isLiteLLMAvailable()` throws this body away and
 * returns a boolean, which cannot answer "which model is down" — the question
 * an operator actually has.
 */
export type LiteLLMHealthEndpoint = {
  model?: string;
  litellm_model_name?: string;
  api_base?: string;
  error?: string;
};

export type LiteLLMHealth = {
  healthy_endpoints: LiteLLMHealthEndpoint[];
  unhealthy_endpoints: LiteLLMHealthEndpoint[];
  healthy_count: number;
  unhealthy_count: number;
};

/**
 * `GET /model/info`. The only source of a model's real upstream — `/v1/models`
 * returns just an id, so provider attribution elsewhere is a prefix guess
 * (`inferOrigin`) or a hand-maintained registry entry.
 */
export type LiteLLMModelInfo = {
  model_name: string;
  litellm_params?: {
    model?: string;
    api_base?: string;
    [key: string]: unknown;
  };
  model_info?: {
    id?: string;
    input_cost_per_token?: number;
    output_cost_per_token?: number;
    max_tokens?: number;
    [key: string]: unknown;
  };
};
