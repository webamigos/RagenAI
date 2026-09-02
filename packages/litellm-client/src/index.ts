/**
 * The LiteLLM proxy admin client.
 *
 * One implementation for apps/web, apps/api and apps/admin. See ADR-34 for why
 * two hand-maintained copies and a pair of open-coded `fetch`es became this.
 */
export {
  createLiteLLMClient,
  type LiteLLMClient,
  type LiteLLMClientOptions,
} from './client';

export { NOOP_LOGGER, type LiteLLMLogger } from './logger';
export { createRetry, type WithLiteLLMRetry } from './retry';

export type {
  LiteLLMHealth,
  LiteLLMHealthEndpoint,
  LiteLLMKeyGenerateParams,
  LiteLLMKeyInfo,
  LiteLLMModelInfo,
  LiteLLMSpendLog,
  LiteLLMSpendLogsParams,
  LiteLLMTeamCreateParams,
  LiteLLMTeamInfo,
  LiteLLMTeamMemberAddParams,
  LiteLLMTeamMemberRemoveParams,
  LiteLLMTeamUpdateParams,
} from './types';
