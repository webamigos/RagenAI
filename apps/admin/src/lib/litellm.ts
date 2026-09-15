import 'server-only';

import { createLiteLLMClient } from '@ragenai/litellm-client';

import { prisma } from './db';
import { logger } from './logger';

/**
 * This app's binding of the shared LiteLLM client (ADR-34).
 *
 * The panel previously open-coded two `fetch` calls to `/team/update`, one in
 * `limits/actions.ts` and one in `models/actions.ts`, each building its own
 * Authorization header and neither inspecting the response.
 *
 * Those writes are gone entirely now, along with `syncOrgToLiteLLM`: budgets
 * and model allowlists are enforced by the application, so a copy in the proxy
 * could only ever be the stale one. What remains here is reading — health,
 * model info, spend — for as long as the proxy exists at all.
 */
const client = createLiteLLMClient({ logger });

export const {
  addLiteLLMTeamMember,
  removeLiteLLMTeamMember,
  fetchLiteLLMModels,
  getLiteLLMHealth,
  getLiteLLMModelInfo,
  getLiteLLMTeamInfo,
  getLiteLLMSpendLogs,
  getLiteLLMKeyInfo,
  isLiteLLMAvailable,
} = client;

export type LiteLLMSyncResult =
  | { ok: true; teamsUpdated: number }
  | { ok: false; reason: string; teamsUpdated: number };
