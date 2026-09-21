import { catalogueCredentialsAddress } from '@ragenai/platform-contracts';

import { logger } from '@/app/lib/utils/logger';
import { ragenAuthClient } from '@/libs/ragen-vault';

import type { ProviderDefinition } from '../../contracts/connector.types';

export type ConnectorOAuthCredentials = {
  clientId?: string;
  clientSecret?: string;
};

/**
 * The OAuth client credentials a connector authorizes with.
 *
 * Two sources, one `if`, in one place:
 *
 * - a **built-in** reads them from the environment it was deployed with,
 *   which is where `SLACK_MCP_CLIENT_ID` and its siblings have always been —
 *   the behaviour pack carries them onto the definition;
 * - an **entry an operator created** reads them from ragen-token-vault, under
 *   the catalogue's own customer id. They are never columns (ADR-32), so the
 *   row carries only `oauthCredentialsStored` and this is what turns that
 *   boolean into the values.
 *
 * The `if` retires when an operator moves a built-in's secrets into the vault,
 * which is a later spec rather than a missing branch.
 */
export async function getConnectorOAuthCredentialsQuery(
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
      { err: error, provider: definition.provider },
      'Could not read catalogue OAuth credentials from the vault',
    );
    return {};
  }
}
