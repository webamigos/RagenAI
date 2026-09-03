/**
 * This app's binding of the shared LiteLLM client.
 *
 * The implementation lives in `@ragenai/litellm-client` (ADR-34). This file was
 * a hand-maintained copy of apps/web's, differing only in its imports and the
 * argument order of three logger calls — which is exactly what the injected
 * logger below now absorbs.
 */
import { Logger } from '@nestjs/common';
import {
  createLiteLLMClient,
  type LiteLLMLogger,
} from '@ragenai/litellm-client';

const nestLogger = new Logger('LiteLLMClient');

/**
 * NestJS's `Logger` takes the message first; the package's contract is
 * context-first, matching Pino. Adapting here keeps one implementation serving
 * both apps.
 */
const logger: LiteLLMLogger = {
  warn: (context, message) => nestLogger.warn(message, context),
  error: (context, message) => nestLogger.error(message, context),
};

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
