import { catalogSlugError } from '@ragenai/platform-contracts';
import { isBlockedHost } from '@ragenai/connector-guard';

import {
  CREATABLE_AUTH_TYPES,
  isCreatableAuthType,
  type CatalogueEntryInput,
  type ValidationFailure,
} from './validation-shape';

/**
 * What a platform administrator may type, and what it must satisfy before it
 * is written.
 *
 * Pure, so it can be tested as itself — and because the same rules have to
 * hold for a create and for an edit, which are two actions.
 *
 * **Server only, and not by convention.** `isBlockedHost` comes from the
 * `@ragenai/connector-guard` barrel, which re-exports the guarded fetch and
 * transport; those import `node:net` and `node:dns` at module scope, and
 * Turbopack cannot put a node builtin in a client chunk. The form takes its
 * constants and its types from `./validation-shape` for that reason — see the
 * comment there. Re-exported below so a server caller still has one import.
 */
export {
  CREATABLE_AUTH_TYPES,
  isCreatableAuthType,
  valuesForAuthType,
} from './validation-shape';
export type {
  CatalogueEntryInput,
  ValidationFailure,
} from './validation-shape';

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
  authType?: string,
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

  // The same rule `protocolsFor` applies when the session is opened, applied
  // here so the operator learns it at the form rather than from a connector
  // that saves, enables and then fails every connection. Everything but
  // `SERVER_SIDE` puts a credential on the wire, and `allowsPrivateAddress`
  // does not excuse it: that flag widens which addresses may be dialled, and a
  // public hostname still resolves with it set.
  if (authType !== undefined && authType !== 'SERVER_SIDE') {
    if (parsed.protocol !== 'https:') {
      return 'A connector that carries a credential needs https. Only a server-side connector, which sends no credential of its own, may use http.';
    }
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
    input.authType,
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
