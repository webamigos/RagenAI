import {
  type AvailableModel,
  type ModelOrigin,
} from '@ragenai/platform-contracts';
import { type LiteLLMLogger } from './logger';
import { type WithLiteLLMRetry } from './retry';
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
export declare function createLiteLLMClient(options?: LiteLLMClientOptions): {
  fetchLiteLLMModels: () => Promise<AvailableModel[]>;
  isLiteLLMAvailable: () => Promise<boolean>;
  getLiteLLMProxyUrl: () => string;
  getLiteLLMApiKey: () => string | undefined;
  createLiteLLMTeam: (
    params: LiteLLMTeamCreateParams,
  ) => Promise<LiteLLMTeamInfo>;
  updateLiteLLMTeam: (
    params: LiteLLMTeamUpdateParams,
  ) => Promise<LiteLLMTeamInfo>;
  deleteLiteLLMTeam: (teamId: string) => Promise<void>;
  addLiteLLMTeamMember: (params: LiteLLMTeamMemberAddParams) => Promise<void>;
  removeLiteLLMTeamMember: (
    params: LiteLLMTeamMemberRemoveParams,
  ) => Promise<void>;
  getLiteLLMTeamInfo: (teamId: string) => Promise<LiteLLMTeamInfo | null>;
  generateLiteLLMKey: (
    params: LiteLLMKeyGenerateParams,
  ) => Promise<LiteLLMKeyInfo>;
  deleteLiteLLMKey: (keyToken: string) => Promise<void>;
  getLiteLLMSpendLogs: (
    params: LiteLLMSpendLogsParams,
  ) => Promise<LiteLLMSpendLog[]>;
  inferOrigin: (modelId: string) => ModelOrigin;
  getLiteLLMHealth: () => Promise<LiteLLMHealth | null>;
  getLiteLLMModelInfo: () => Promise<LiteLLMModelInfo[]>;
  getLiteLLMKeyInfo: (keyToken: string) => Promise<LiteLLMKeyInfo | null>;
  withLiteLLMRetry: WithLiteLLMRetry;
};
export type LiteLLMClient = ReturnType<typeof createLiteLLMClient>;
//# sourceMappingURL=client.d.ts.map
