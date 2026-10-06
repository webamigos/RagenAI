import { describe, expect, it } from 'vitest';
import { mcp } from '@better-auth/mcp';
import {
  OAUTH_SCALAR_LIST_FIELDS,
  sanitizeOAuthScalarLists,
} from '../oauth-scalar-lists';

describe('OAuth scalar lists', () => {
  it('tracks every list declared by the installed plugin', () => {
    const schema = mcp({
      resource: 'http://localhost:3300/mcp',
      loginPage: '/login',
      consentPage: '/consent',
    }).schema!;
    const expected = Object.fromEntries(
      Object.entries(schema).flatMap(([model, definition]) => {
        const fields = Object.entries(definition.fields)
          .filter(([, field]) => field.type === 'string[]')
          .map(([field]) => field);
        return fields.length ? [[model, fields]] : [];
      }),
    );
    expect(OAUTH_SCALAR_LIST_FIELDS).toEqual(expected);
  });
  it('drops null lists without mutating input or discarding nullable scalars', () => {
    const input = {
      scopes: null,
      resources: ['https://mcp.example/mcp'],
      referenceId: null,
    };
    expect(sanitizeOAuthScalarLists('OauthConsent', input)).toEqual({
      resources: input.resources,
      referenceId: null,
    });
    expect(input.scopes).toBeNull();
  });
  it('preserves empty lists and handles bulk writes', () => {
    expect(
      sanitizeOAuthScalarLists('OauthClient', [
        { scopes: null },
        { scopes: [] },
      ]),
    ).toEqual([{}, { scopes: [] }]);
  });
  it('leaves other models unchanged', () => {
    const input = { scopes: null };
    expect(sanitizeOAuthScalarLists('McpOAuthToken', input)).toBe(input);
  });
});
