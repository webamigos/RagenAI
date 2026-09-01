import { Logger } from '@nestjs/common';
import {
  MODEL_REGISTRY,
  type AvailableModel,
  type ModelOrigin,
} from '../llm/model-registry.js';
import type {
  LiteLLMTeamCreateParams,
  LiteLLMTeamUpdateParams,
  LiteLLMTeamInfo,
  LiteLLMTeamMemberAddParams,
  LiteLLMTeamMemberRemoveParams,
  LiteLLMKeyGenerateParams,
  LiteLLMKeyInfo,
  LiteLLMSpendLog,
  LiteLLMSpendLogsParams,
} from './types.js';

const logger = new Logger('LiteLLMClient');

type LiteLLMModel = {
  id: string;
  object: string;
  created: number;
  owned_by: string;
};

type LiteLLMModelsResponse = {
  object: string;
  data: LiteLLMModel[];
};

const LITELLM_PROXY_URL =
  process.env.LITELLM_PROXY_URL || 'http://localhost:4000';
const LITELLM_MASTER_KEY = process.env.LITELLM_MASTER_KEY;

/** Infer the visual origin (for UI grouping) from a LiteLLM model name */
function inferOrigin(modelId: string): ModelOrigin {
  const lower = modelId.toLowerCase();
  if (
    lower.startsWith('gpt') ||
    lower.startsWith('o1') ||
    lower.startsWith('o3') ||
    lower.startsWith('o4')
  ) {
    return 'openai';
  }
  if (lower.startsWith('gemini')) {
    return 'google';
  }
  if (lower.startsWith('claude')) {
    return 'anthropic';
  }
  // Default to openai for unknown models
  return 'openai';
}

/** Infer a human-readable label from a LiteLLM model name */
function inferLabel(modelId: string): string {
  return modelId.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Check if a model likely supports extended thinking / reasoning */
function inferReasoning(modelId: string): boolean {
  const lower = modelId.toLowerCase();
  return (
    lower.includes('o1') ||
    lower.includes('o3') ||
    lower.includes('o4') ||
    lower.includes('opus') ||
    lower.includes('sonnet') ||
    (lower.includes('gemini') && lower.includes('pro'))
  );
}

// Cache for fetched models
let modelsCache: { data: AvailableModel[]; timestamp: number } | null = null;
const MODELS_CACHE_TTL = 60_000; // 1 minute

/**
 * Fetch available models from the LiteLLM proxy.
 * Returns models mapped to AvailableModel format for the UI.
 */
export async function fetchLiteLLMModels(): Promise<AvailableModel[]> {
  if (modelsCache && Date.now() - modelsCache.timestamp < MODELS_CACHE_TTL) {
    return modelsCache.data;
  }

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (LITELLM_MASTER_KEY) {
      headers['Authorization'] = `Bearer ${LITELLM_MASTER_KEY}`;
    }

    const response = await fetch(`${LITELLM_PROXY_URL}/v1/models`, {
      headers,
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      logger.warn(
        `Failed to fetch models from LiteLLM proxy (status ${response.status})`,
      );
      return modelsCache?.data ?? [];
    }

    const data = (await response.json()) as LiteLLMModelsResponse;

    const models: AvailableModel[] = data.data
      .filter((m) => {
        const entry = MODEL_REGISTRY[m.id];
        // If model is in registry, respect its visibility; otherwise show it
        return !entry || entry.visible;
      })
      .map((m) => {
        const entry = MODEL_REGISTRY[m.id];
        return {
          value: m.id,
          label: entry?.displayName ?? inferLabel(m.id),
          provider: 'litellm' as const,
          origin: entry?.origin ?? inferOrigin(m.id),
          reasoning: entry?.reasoning ?? inferReasoning(m.id),
        };
      });

    modelsCache = { data: models, timestamp: Date.now() };
    return models;
  } catch (error) {
    logger.error('Error fetching models from LiteLLM proxy', { err: error });
    return modelsCache?.data ?? [];
  }
}

/** Check if the LiteLLM proxy is reachable */
export async function isLiteLLMAvailable(): Promise<boolean> {
  try {
    const headers: Record<string, string> = {};
    if (LITELLM_MASTER_KEY) {
      headers['Authorization'] = `Bearer ${LITELLM_MASTER_KEY}`;
    }

    const response = await fetch(`${LITELLM_PROXY_URL}/health`, {
      headers,
      signal: AbortSignal.timeout(3000),
    });

    return response.ok;
  } catch {
    return false;
  }
}

export function getLiteLLMProxyUrl(): string {
  return LITELLM_PROXY_URL;
}

export function getLiteLLMApiKey(): string | undefined {
  return LITELLM_MASTER_KEY;
}

// --- Helper for master-key-authenticated requests ---

function masterKeyHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (LITELLM_MASTER_KEY) {
    headers['Authorization'] = `Bearer ${LITELLM_MASTER_KEY}`;
  }
  return headers;
}

// --- Team Management ---

export async function createLiteLLMTeam(
  params: LiteLLMTeamCreateParams,
): Promise<LiteLLMTeamInfo> {
  const body: Record<string, unknown> = {
    team_id: params.teamId,
    team_alias: params.teamAlias,
  };
  if (params.maxBudget != null) {
    body.max_budget = params.maxBudget;
  }
  if (params.budgetDuration) {
    body.budget_duration = params.budgetDuration;
  }
  if (params.models && params.models.length > 0) {
    body.models = params.models;
  }
  if (params.tpmLimit != null) {
    body.tpm_limit = params.tpmLimit;
  }
  if (params.rpmLimit != null) {
    body.rpm_limit = params.rpmLimit;
  }

  const response = await fetch(`${LITELLM_PROXY_URL}/team/new`, {
    method: 'POST',
    headers: masterKeyHeaders(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `Failed to create LiteLLM team: ${response.status} ${text}`,
    );
  }

  return (await response.json()) as LiteLLMTeamInfo;
}

export async function updateLiteLLMTeam(
  params: LiteLLMTeamUpdateParams,
): Promise<LiteLLMTeamInfo> {
  const body: Record<string, unknown> = {
    team_id: params.teamId,
  };
  if (params.maxBudget !== undefined) {
    body.max_budget = params.maxBudget;
  }
  if (params.budgetDuration !== undefined) {
    body.budget_duration = params.budgetDuration;
  }
  if (params.models !== undefined) {
    body.models = params.models;
  }
  if (params.tpmLimit !== undefined) {
    body.tpm_limit = params.tpmLimit;
  }
  if (params.rpmLimit !== undefined) {
    body.rpm_limit = params.rpmLimit;
  }

  const response = await fetch(`${LITELLM_PROXY_URL}/team/update`, {
    method: 'POST',
    headers: masterKeyHeaders(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `Failed to update LiteLLM team: ${response.status} ${text}`,
    );
  }

  return (await response.json()) as LiteLLMTeamInfo;
}

export async function deleteLiteLLMTeam(teamId: string): Promise<void> {
  const response = await fetch(`${LITELLM_PROXY_URL}/team/delete`, {
    method: 'POST',
    headers: masterKeyHeaders(),
    body: JSON.stringify({ team_ids: [teamId] }),
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok && response.status !== 404) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `Failed to delete LiteLLM team: ${response.status} ${text}`,
    );
  }
}

export async function addLiteLLMTeamMember(
  params: LiteLLMTeamMemberAddParams,
): Promise<void> {
  const member: Record<string, unknown> = {
    user_id: params.userId,
    role: params.role ?? 'user',
  };
  if (params.userEmail) {
    member.user_email = params.userEmail;
  }

  const response = await fetch(`${LITELLM_PROXY_URL}/team/member_add`, {
    method: 'POST',
    headers: masterKeyHeaders(),
    body: JSON.stringify({
      team_id: params.teamId,
      member,
    }),
    signal: AbortSignal.timeout(5000),
  });

  // LiteLLM returns 400 when the user is already in the team — treat as idempotent.
  if (!response.ok && response.status !== 400) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `Failed to add LiteLLM team member: ${response.status} ${text}`,
    );
  }
}

export async function removeLiteLLMTeamMember(
  params: LiteLLMTeamMemberRemoveParams,
): Promise<void> {
  const body: Record<string, unknown> = {
    team_id: params.teamId,
  };
  if (params.userId) {
    body.user_id = params.userId;
  }
  if (params.userEmail) {
    body.user_email = params.userEmail;
  }

  const response = await fetch(`${LITELLM_PROXY_URL}/team/member_delete`, {
    method: 'POST',
    headers: masterKeyHeaders(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok && response.status !== 404) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `Failed to remove LiteLLM team member: ${response.status} ${text}`,
    );
  }
}

export async function getLiteLLMTeamInfo(
  teamId: string,
): Promise<LiteLLMTeamInfo | null> {
  try {
    const response = await fetch(
      `${LITELLM_PROXY_URL}/team/info?team_id=${encodeURIComponent(teamId)}`,
      {
        headers: masterKeyHeaders(),
        signal: AbortSignal.timeout(5000),
      },
    );

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(
        `Failed to get LiteLLM team info: ${response.status} ${text}`,
      );
    }

    const data = await response.json();
    return (data.team_info ?? data) as LiteLLMTeamInfo;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('Failed to get LiteLLM team info')
    ) {
      throw error;
    }
    logger.error('Error fetching LiteLLM team info', { err: error, teamId });
    return null;
  }
}

// --- Key Management ---

export async function generateLiteLLMKey(
  params: LiteLLMKeyGenerateParams,
): Promise<LiteLLMKeyInfo> {
  const body: Record<string, unknown> = {
    team_id: params.teamId,
  };
  if (params.keyAlias) {
    body.key_alias = params.keyAlias;
  }
  if (params.models && params.models.length > 0) {
    body.models = params.models;
  }
  if (params.maxBudget != null) {
    body.max_budget = params.maxBudget;
  }

  const response = await fetch(`${LITELLM_PROXY_URL}/key/generate`, {
    method: 'POST',
    headers: masterKeyHeaders(),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `Failed to generate LiteLLM key: ${response.status} ${text}`,
    );
  }

  return (await response.json()) as LiteLLMKeyInfo;
}

export async function deleteLiteLLMKey(keyToken: string): Promise<void> {
  const response = await fetch(`${LITELLM_PROXY_URL}/key/delete`, {
    method: 'POST',
    headers: masterKeyHeaders(),
    body: JSON.stringify({ keys: [keyToken] }),
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Failed to delete LiteLLM key: ${response.status} ${text}`);
  }
}

// --- Spend Logs ---

export async function getLiteLLMSpendLogs(
  params: LiteLLMSpendLogsParams,
): Promise<LiteLLMSpendLog[]> {
  const searchParams = new URLSearchParams();
  searchParams.set('team_id', params.teamId);
  if (params.startDate) {
    searchParams.set('start_date', params.startDate);
  }
  if (params.endDate) {
    searchParams.set('end_date', params.endDate);
  }

  const response = await fetch(
    `${LITELLM_PROXY_URL}/spend/logs?${searchParams.toString()}`,
    {
      headers: masterKeyHeaders(),
      signal: AbortSignal.timeout(10000),
    },
  );

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `Failed to fetch LiteLLM spend logs: ${response.status} ${text}`,
    );
  }

  return (await response.json()) as LiteLLMSpendLog[];
}

export { inferOrigin };
