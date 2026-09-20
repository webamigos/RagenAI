import {
  OPERATOR_CREATABLE_AUTH_TYPES,
  catalogSlugError,
  type McpAuthType,
} from '@ragenai/platform-contracts';
import { isBlockedHost } from '@ragenai/connector-guard';

/**
 * What a platform administrator may type, and what it must satisfy before it
 * is written.
 *
 * Pure, so it can be tested as itself — and because the same rules have to
 * hold for a create and for an edit, which are two actions.
 */
export type CatalogueEntryInput = {
  slug: string;
  label: string;
  description: string;
  mcpServerUrl: string;
  authType: string;
  icon: string;
  lucideIcon: string;
  systemPrompt: string;
  allowsPrivateAddress: boolean;
  /** `EXTERNAL_MCP` only: what the authorization request asks for. */
  scopes: string[];
  /**
   * `EXTERNAL_MCP` only: rewrite `scope` to `user_scope` in the authorization
   * URL. Slack requires it; nothing else here does.
   */
  useUserScope: boolean;
};

/**
 * The shapes this panel can create. The other three are seeded only:
 * `API_KEY_CUSTOM_HEADER` assembles its URL from a shop address the *user*
 * types, which is code, and `OAUTH`/`API_KEY` predate the manifest shapes
 * that replaced them.
 *
 * `EXTERNAL_MCP` joined the list in Phase D, with the vault-held client
 * credentials it needs — an entry saved without them is saved and cannot be
 * connected, which the form says rather than refusing the save: the
 * credentials are a second step against a row that must exist first.
 */
export const CREATABLE_AUTH_TYPES = OPERATOR_CREATABLE_AUTH_TYPES;

export type ValidationFailure = {
  field: keyof CatalogueEntryInput;
  message: string;
};

export function isCreatableAuthType(value: string): value is McpAuthType {
  return (CREATABLE_AUTH_TYPES as readonly string[]).includes(value);
}

/**
 * The address check at save time — one of the three moments the policy runs
 * (the others are connect time and every tool call, both through the guarded
 * transport, where a public hostname that resolves to a private address is
 * caught).
 *
 * A URL typed into this form is deployer-controlled *and* user-supplied, which
 * is the case the exemption for `MCP_*_SERVER_URL` was never written for. So
 * the policy applies, and an entry may opt out of the private ranges alone.
 */
export function serverUrlFailure(
  url: string,
  allowsPrivateAddress: boolean,
): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'Enter the full URL of the MCP endpoint, including https://.';
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return 'The URL must be http:// or https://.';
  }

  if (isBlockedHost(parsed.hostname, { allowPrivate: allowsPrivateAddress })) {
    return allowsPrivateAddress
      ? 'That address is loopback, link-local or reserved. Allowing private addresses does not allow these — cloud metadata lives on link-local, and nothing you self-host does.'
      : 'That address is private or reserved. Tick "allow a private address" if this server is on your own network.';
  }

  return null;
}

export function validateEntry(
  input: CatalogueEntryInput,
  options: { isNew: boolean } = { isNew: true },
): ValidationFailure | null {
  if (options.isNew) {
    const slugProblem = catalogSlugError(input.slug.trim());
    if (slugProblem) {
      return { field: 'slug', message: slugProblem };
    }
  }

  if (input.label.trim().length === 0) {
    return { field: 'label', message: 'A name is required.' };
  }
  if (input.label.trim().length > 120) {
    return { field: 'label', message: 'A name is at most 120 characters.' };
  }

  if (!isCreatableAuthType(input.authType)) {
    return {
      field: 'authType',
      message: `This panel can create ${CREATABLE_AUTH_TYPES.join(' and ')} entries.`,
    };
  }

  const urlProblem = serverUrlFailure(
    input.mcpServerUrl.trim(),
    input.allowsPrivateAddress,
  );
  if (urlProblem) {
    return { field: 'mcpServerUrl', message: urlProblem };
  }

  if (input.authType !== 'EXTERNAL_MCP' && input.scopes.length > 0) {
    return {
      field: 'scopes',
      message: 'Scopes are part of an OAuth authorization request.',
    };
  }

  // A brand asset is optional — the gallery falls back to the lucide icon —
  // but a path that is neither a URL nor rooted would render as a broken
  // image on every card.
  const icon = input.icon.trim();
  if (icon.length > 0 && !icon.startsWith('/') && !/^https?:\/\//.test(icon)) {
    return {
      field: 'icon',
      message: 'An icon is a path starting with / or a full https:// URL.',
    };
  }

  return null;
}
