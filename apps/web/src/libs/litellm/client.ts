/**
 * This app's binding of the shared LiteLLM client.
 *
 * The implementation lives in `@ragenai/litellm-client` (ADR-34) because
 * apps/api kept a near-identical copy and apps/admin open-coded two `fetch`es
 * against the same proxy. Re-exported one name at a time so every existing
 * `@/libs/litellm/client` import keeps working unchanged.
 */
import { createLiteLLMClient } from '@ragenai/litellm-client';
import { logger } from '@/app/lib/utils/logger';

const client = createLiteLLMClient({ logger });

export const {
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
  getLiteLLMHealth,
  getLiteLLMModelInfo,
  getLiteLLMKeyInfo,
  inferOrigin,
} = client;
