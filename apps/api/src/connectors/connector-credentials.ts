import { Logger } from '@nestjs/common';
import { catalogueCredentialsAddress } from '@ragenai/platform-contracts';

import { ragenAuthClient } from '../ragen-vault/index.js';
import type { ProviderDefinition } from './types.js';

export type ConnectorOAuthCredentials = {
  clientId?: string;
  clientSecret?: string;
};

const logger = new Logger('ConnectorCredentials');

/**
 * The OAuth client credentials a connector authorizes with.
 *
 * Ported from apps/web's
 * `src/features/connectors/services/queries/get-connector-credentials-query.ts`
 * and deliberately identical to it, because the two run the same connectors
 * against the same vault — see `apps/api/AGENTS.md` on the ported libs.
 *
 * Two sources, one `if`:
 *
 * - a **built-in** reads them from the environment it was deployed with, which
 *   is where `SLACK_MCP_CLIENT_ID` and its siblings have always been — the
 *   behaviour pack carries them onto the definition;
 * - an **entry an operator created** reads them from ragen-token-vault, under
 *   the catalogue's own customer id. They are never columns (ADR-32), so the
 *   row carries only `oauthCredentialsStored` and this is what turns that
 *   boolean into the values.
 *
 * Without this, an operator-added OAuth connector reached the public API with
 * `fixedClientId`/`fixedClientSecret` undefined and could not refresh a token.
 */
export async function getConnectorOAuthCredentials(
  definition: ProviderDefinition,
): Promise<ConnectorOAuthCredentials> {
  if (definition.oauthClientId || definition.oauthClientSecret) {
    return {
      clientId: definition.oauthClientId,
      clientSecret: definition.oauthClientSecret,
    };
  }

  if (!definition.oauthCredentialsStored) {
    return {};
  }

  const address = catalogueCredentialsAddress(definition.provider);
  try {
    const stored = await ragenAuthClient.getToken(
      address.customerId,
      address.provider,
    );
    return {
      clientId: stored.clientId ?? undefined,
      clientSecret: stored.clientSecret ?? undefined,
    };
  } catch (error) {
    // Not fatal here: the caller decides what an entry with no credentials
    // means, and for an `external_mcp` connector that is a failed connect with
    // a reason on the row rather than a crash.
    logger.error(
      `Could not read catalogue OAuth credentials for ${definition.provider}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return {};
  }
}
