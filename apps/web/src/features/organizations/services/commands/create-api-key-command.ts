import { randomBytes } from 'node:crypto';
import db from '@ragenai/prisma-client';
import { getRagenAuthClient } from '@/libs/ragen-vault/client';
import { maskApiKey } from '@/app/lib/utils/hashApiKey';
import { trackAudit } from '@/features/audit-logs/services/commands/create-audit-log-command';
import { recordSecurityEvent } from '@/features/security/services/commands/record-security-event-command';
import { logger } from '@/app/lib/utils/logger';
import { isFeatureEnabledQuery } from '@/features/subscriptions/services/queries/get-effective-features-query';
import {
  BadRequestException,
  UnauthorizedException,
} from '@/libs/utils/errors';
import {
  DEFAULT_KNOWLEDGE_SCOPE,
  scopeRequiresProject,
  type KnowledgeScope,
} from '@ragenai/platform-contracts';

const VAULT_PROVIDER = 'ragen-api-key';
const KEY_PREFIX = 'sk-';

type CreateApiKeyInput = {
  orgId: string;
  userId: string;
  name: string;
  /**
   * What the key may reach. Omitted means `KNOWLEDGE_BASE`, which is both
   * `DEFAULT_KNOWLEDGE_SCOPE` and the column's default — a key created by a
   * caller that predates this field behaves the way every key did before it.
   */
  knowledgeScope?: KnowledgeScope;
  projectId?: string;
  debugMode?: boolean;
};

type CreateApiKeyResult = {
  id: string;
  name: string;
  maskedValue: string;
  fullKey: string;
};

function generateApiKey(keyId: string): string {
  const secret = randomBytes(32).toString('base64url');
  return `${KEY_PREFIX}${keyId}.${secret}`;
}

/**
 * The scope and the project are one fact written in two columns, so they are
 * checked together before either is stored. `ASSISTANT` is a boundary the API
 * enforces on every request; a row where the two disagree would be a boundary
 * that cannot be evaluated, discovered at request time rather than here.
 *
 * `MODEL_ONLY` is a legal `KnowledgeScope` and is refused on purpose: the
 * value exists for threads, and apps/api's chain does not yet honour it, so a
 * key promising not to retrieve would retrieve anyway.
 */
function assertScopeAndProjectAgree(
  knowledgeScope: KnowledgeScope,
  projectId: string | undefined,
): void {
  if (knowledgeScope === 'MODEL_ONLY') {
    throw new BadRequestException(
      'MODEL_ONLY is not available for API keys yet',
    );
  }
  if (scopeRequiresProject(knowledgeScope) && !projectId) {
    throw new BadRequestException(
      'An ASSISTANT-scoped API key needs the assistant it is scoped to',
    );
  }
  if (!scopeRequiresProject(knowledgeScope) && projectId) {
    throw new BadRequestException(
      `An API key scoped to ${knowledgeScope} cannot also name an assistant`,
    );
  }
}

export const createApiKeyCommand = async (
  input: CreateApiKeyInput,
): Promise<CreateApiKeyResult> => {
  const {
    orgId,
    userId,
    name,
    projectId,
    debugMode,
    knowledgeScope = DEFAULT_KNOWLEDGE_SCOPE,
  } = input;

  assertScopeAndProjectAgree(knowledgeScope, projectId);

  const canCreate = await isFeatureEnabledQuery(orgId, 'apiAccess');
  if (!canCreate) {
    throw new UnauthorizedException(
      'API access is not enabled for your organization plan',
    );
  }

  // Create the DB record first to get the UUID
  const apiKey = await db.apiKey.create({
    data: {
      name,
      maskedValue: '', // placeholder, updated below
      organizationId: orgId,
      projectId: projectId ?? null,
      knowledgeScope,
      createdBy: userId,
      debugMode: debugMode ?? false,
    },
  });

  let vaultWritten = false;
  try {
    const fullKey = generateApiKey(apiKey.id);
    const maskedValue = maskApiKey(fullKey);

    // Store the full key in vault
    await getRagenAuthClient().storeToken(
      `api-key-${apiKey.id}`,
      VAULT_PROVIDER,
      { accessToken: fullKey },
    );
    vaultWritten = true;

    // Update the masked value in DB
    await db.apiKey.update({
      where: { id: apiKey.id },
      data: { maskedValue },
    });

    trackAudit({
      action: 'api-key.created',
      entityType: 'api-key',
      entityId: apiKey.id,
      newData: {
        name,
        projectId,
        knowledgeScope,
        debugMode: debugMode ?? false,
      },
    });

    recordSecurityEvent({
      eventType: 'API_KEY_CREATED',
      severity: 'info',
      source: 'admin',
      organizationId: orgId,
      userId,
      metadata: {
        apiKeyId: apiKey.id,
        projectId,
        knowledgeScope,
        keyName: name,
      },
    });

    return { id: apiKey.id, name, maskedValue, fullKey };
  } catch (error) {
    // Cleanup orphaned vault entry if vault write succeeded but DB update failed
    if (vaultWritten) {
      await getRagenAuthClient()
        .deleteToken(`api-key-${apiKey.id}`, VAULT_PROVIDER)
        .catch((vaultErr) => {
          logger.error(
            { err: vaultErr, apiKeyId: apiKey.id },
            'Failed to cleanup orphaned vault entry',
          );
        });
    }
    // Cleanup orphaned DB record
    await db.apiKey.delete({ where: { id: apiKey.id } }).catch((cleanupErr) => {
      logger.error({ err: cleanupErr }, 'Failed to cleanup orphaned API key');
    });
    throw error;
  }
};
