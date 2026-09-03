import {
  MODEL_REGISTRY,
  type AvailableModel,
  type ModelOrigin,
} from '@ragenai/platform-contracts';

import { NOOP_LOGGER, type LiteLLMLogger } from './logger';
import { createRetry, type WithLiteLLMRetry } from './retry';
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
  LiteLLMHealth,
  LiteLLMModelInfo,
} from './types';

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

export type LiteLLMClientOptions = {
  /** Defaults to `LITELLM_PROXY_URL`, then `http://localhost:4000`. */
  proxyUrl?: string;
  /** Defaults to `LITELLM_MASTER_KEY`. Unset means the proxy runs without auth (local dev). */
  masterKey?: string;
  /** Omit and proxy failures go unheard — see `logger.ts`. */
  logger?: LiteLLMLogger;
};

/**
 * Build a client bound to one proxy and one logger.
 *
 * This was two hand-maintained copies — `apps/web/src/libs/litellm/` and
 * `apps/api/src/litellm/` — differing only in imports and the argument order of
 * three logger calls, while `apps/admin` had neither and open-coded two
 * `fetch`es whose responses it never inspected. See ADR-34.
 *
 * The model cache is per client instance rather than per module, so two clients
 * pointed at different proxies cannot serve each other's answers.
 */
export function createLiteLLMClient(options: LiteLLMClientOptions = {}) {
  const proxyUrl =
    options.proxyUrl ??
    process.env.LITELLM_PROXY_URL ??
    'http://localhost:4000';
  const masterKey = options.masterKey ?? process.env.LITELLM_MASTER_KEY;
  const logger = options.logger ?? NOOP_LOGGER;
  const withLiteLLMRetry: WithLiteLLMRetry = createRetry(logger);

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
    return modelId
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
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
  async function fetchLiteLLMModels(): Promise<AvailableModel[]> {
    if (modelsCache && Date.now() - modelsCache.timestamp < MODELS_CACHE_TTL) {
      return modelsCache.data;
    }

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (masterKey) {
        headers['Authorization'] = `Bearer ${masterKey}`;
      }

      const response = await fetch(`${proxyUrl}/v1/models`, {
        headers,
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        logger.warn(
          { status: response.status },
          'Failed to fetch models from LiteLLM proxy',
        );
        return modelsCache?.data ?? [];
      }

      const data = (await response.json()) as LiteLLMModelsResponse;

      // A proxy behind an auth gateway can answer 200 with an error object;
      // `.filter` on that throws inside a function whose whole contract is
      // that it never does.
      if (!Array.isArray(data?.data)) {
        logger.warn({}, 'LiteLLM /v1/models returned an unexpected shape');
        return modelsCache?.data ?? [];
      }

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
      logger.error({ err: error }, 'Error fetching models from LiteLLM proxy');
      return modelsCache?.data ?? [];
    }
  }

  /** Check if the LiteLLM proxy is reachable */
  async function isLiteLLMAvailable(): Promise<boolean> {
    try {
      const headers: Record<string, string> = {};
      if (masterKey) {
        headers['Authorization'] = `Bearer ${masterKey}`;
      }

      const response = await fetch(`${proxyUrl}/health`, {
        headers,
        signal: AbortSignal.timeout(3000),
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  function getLiteLLMProxyUrl(): string {
    return proxyUrl;
  }

  function getLiteLLMApiKey(): string | undefined {
    return masterKey;
  }

  // --- Helper for master-key-authenticated requests ---

  function masterKeyHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (masterKey) {
      headers['Authorization'] = `Bearer ${masterKey}`;
    }
    return headers;
  }

  // --- Team Management ---

  async function createLiteLLMTeam(
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

    const response = await fetch(`${proxyUrl}/team/new`, {
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

  async function updateLiteLLMTeam(
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

    const response = await fetch(`${proxyUrl}/team/update`, {
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

  async function deleteLiteLLMTeam(teamId: string): Promise<void> {
    const response = await fetch(`${proxyUrl}/team/delete`, {
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

  async function addLiteLLMTeamMember(
    params: LiteLLMTeamMemberAddParams,
  ): Promise<void> {
    const member: Record<string, unknown> = {
      user_id: params.userId,
      role: params.role ?? 'user',
    };
    if (params.userEmail) {
      member.user_email = params.userEmail;
    }

    const response = await fetch(`${proxyUrl}/team/member_add`, {
      method: 'POST',
      headers: masterKeyHeaders(),
      body: JSON.stringify({
        team_id: params.teamId,
        member,
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      // LiteLLM answers 400 when the user is already in the team, which makes
      // this call idempotent. It answers 400 for an unknown team id and a
      // malformed body too, and treating every 400 as success hid those.
      const alreadyMember =
        response.status === 400 && /already.*in.*team/i.test(text);
      if (!alreadyMember) {
        throw new Error(
          `Failed to add LiteLLM team member: ${response.status} ${text}`,
        );
      }
    }
  }

  async function removeLiteLLMTeamMember(
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

    const response = await fetch(`${proxyUrl}/team/member_delete`, {
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

  async function getLiteLLMTeamInfo(
    teamId: string,
  ): Promise<LiteLLMTeamInfo | null> {
    try {
      const response = await fetch(
        `${proxyUrl}/team/info?team_id=${encodeURIComponent(teamId)}`,
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

      // The proxy has returned both shapes across versions: the team object
      // itself, and the same object wrapped in `team_info`.
      const data = (await response.json()) as {
        team_info?: LiteLLMTeamInfo;
      } & LiteLLMTeamInfo;
      return data.team_info ?? data;
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('Failed to get LiteLLM team info')
      ) {
        throw error;
      }
      logger.error({ err: error, teamId }, 'Error fetching LiteLLM team info');
      return null;
    }
  }

  // --- Key Management ---

  async function generateLiteLLMKey(
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

    const response = await fetch(`${proxyUrl}/key/generate`, {
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

  async function deleteLiteLLMKey(keyToken: string): Promise<void> {
    const response = await fetch(`${proxyUrl}/key/delete`, {
      method: 'POST',
      headers: masterKeyHeaders(),
      body: JSON.stringify({ keys: [keyToken] }),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(
        `Failed to delete LiteLLM key: ${response.status} ${text}`,
      );
    }
  }

  // --- Spend Logs ---

  async function getLiteLLMSpendLogs(
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
      `${proxyUrl}/spend/logs?${searchParams.toString()}`,
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

    const payload = await response.json();
    if (!Array.isArray(payload)) {
      throw new Error(
        'Failed to fetch LiteLLM spend logs: 200 response was not an array',
      );
    }
    return payload as LiteLLMSpendLog[];
  }

  /**
   * Full `/health` payload, not just reachability.
   *
   * `isLiteLLMAvailable()` above answers "is the proxy up"; this answers "which
   * deployments are failing", which is the question behind a user reporting one
   * model erroring while the rest work. Returns null rather than throwing, so a
   * dashboard degrades to "unknown" instead of erroring.
   */
  async function getLiteLLMHealth(): Promise<LiteLLMHealth | null> {
    try {
      const response = await fetch(`${proxyUrl}/health`, {
        headers: masterKeyHeaders(),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        logger.warn({ status: response.status }, 'LiteLLM /health not ok');
        return null;
      }
      return (await response.json()) as LiteLLMHealth;
    } catch (error) {
      logger.warn({ err: error }, 'LiteLLM /health unreachable');
      return null;
    }
  }

  /**
   * `/model/info` — the deployed model list with the upstream each one routes
   * to. Requires the master key; returns an empty list when unavailable so a
   * caller can fall back to `/v1/models`, which every key can read.
   */
  async function getLiteLLMModelInfo(): Promise<LiteLLMModelInfo[]> {
    try {
      const response = await fetch(`${proxyUrl}/model/info`, {
        headers: masterKeyHeaders(),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        logger.warn({ status: response.status }, 'LiteLLM /model/info not ok');
        return [];
      }
      const payload = (await response.json()) as { data?: LiteLLMModelInfo[] };
      return payload.data ?? [];
    } catch (error) {
      logger.warn({ err: error }, 'LiteLLM /model/info unreachable');
      return [];
    }
  }

  /**
   * Spend and budget for one virtual key. `LiteLLMKeyInfo.spend` is only ever
   * populated from the `/key/generate` response today, which means it is always
   * zero wherever it is read.
   */
  async function getLiteLLMKeyInfo(
    keyToken: string,
  ): Promise<LiteLLMKeyInfo | null> {
    try {
      const response = await fetch(
        `${proxyUrl}/key/info?key=${encodeURIComponent(keyToken)}`,
        { headers: masterKeyHeaders(), signal: AbortSignal.timeout(5000) },
      );
      if (response.status === 404) {
        return null;
      }
      if (!response.ok) {
        logger.warn({ status: response.status }, 'LiteLLM /key/info not ok');
        return null;
      }
      const payload = (await response.json()) as {
        info?: LiteLLMKeyInfo;
      } & LiteLLMKeyInfo;
      return payload.info ?? payload;
    } catch (error) {
      logger.warn({ err: error }, 'LiteLLM /key/info unreachable');
      return null;
    }
  }

  return {
    fetchLiteLLMModels,
    isLiteLLMAvailable,
    getLiteLLMProxyUrl,
    getLiteLLMApiKey,
    createLiteLLMTeam,
    updateLiteLLMTeam,
    deleteLiteLLMTeam,
    addLiteLLMTeamMember,
    removeLiteLLMTeamMember,
    getLiteLLMTeamInfo,
    generateLiteLLMKey,
    deleteLiteLLMKey,
    getLiteLLMSpendLogs,
    inferOrigin,
    getLiteLLMHealth,
    getLiteLLMModelInfo,
    getLiteLLMKeyInfo,
    withLiteLLMRetry,
  };
}

export type LiteLLMClient = ReturnType<typeof createLiteLLMClient>;
