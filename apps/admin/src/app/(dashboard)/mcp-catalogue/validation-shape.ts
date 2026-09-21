import {
  OPERATOR_CREATABLE_AUTH_TYPES,
  type McpAuthType,
} from '@ragenai/platform-contracts';

/**
 * The half of the catalogue form's rules a browser may hold.
 *
 * `validation.ts` is the validator, and it checks the server URL against the
 * SSRF policy in `@ragenai/connector-guard` — whose barrel re-exports the
 * guarded fetch and transport, which import `node:net` and `node:dns` at module
 * scope. Turbopack cannot externalise a node builtin into a client chunk, so
 * `CatalogueEntryForm` importing the validator for its *constants* put
 * `node:net` in a static chunk: the page server-rendered, hydrated, threw
 * `Cannot find module 'node:net'` and replaced itself with the error boundary.
 * Green build, HTTP 200, blank page — and `/mcp-catalogue` is the one screen
 * ADR-52 exists to provide.
 *
 * The same shape as `@ragenai/guardrails/contracts`, and for the same reason:
 * the client needs the vocabulary, not the enforcement. Everything here is a
 * type, a constant or a pure function over the form's own values, so this
 * module has no imports beyond `@ragenai/platform-contracts`, which has none of
 * its own.
 *
 * `tests/architecture/client-bundles-stay-browser-safe.test.ts` walks into the
 * workspace packages and fails on any `node:` builtin a client component can
 * reach, so the mistake cannot come back unnoticed the way it did here.
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
 * The values after a change of authentication type.
 *
 * Scopes and `useUserScope` belong to an OAuth authorization request, and
 * `validateEntry` refuses them on anything else. The form only renders those
 * fields inside its `EXTERNAL_MCP` block, so a scope typed and then left
 * behind by switching type failed the save with its message attached to a
 * field nobody could see — a Save button that did nothing and said nothing.
 *
 * Clearing them here means the rule cannot be broken from the form at all.
 * `validateEntry` stays as the guard for the action, which a form is not the
 * only way to reach.
 */
export function valuesForAuthType(
  current: CatalogueEntryInput,
  authType: string,
): CatalogueEntryInput {
  const isOAuth = authType === 'EXTERNAL_MCP';
  return {
    ...current,
    authType,
    scopes: isOAuth ? current.scopes : [],
    useUserScope: isOAuth ? current.useUserScope : false,
  };
}
