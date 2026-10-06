import { ConfigService } from '@nestjs/config';
import { issueMcpServiceAssertion } from '@ragenai/crypto/mcp-service';
import { McpServiceAuthService } from './mcp-service-auth.service.js';
const secret = 'dedicated-mcp-secret-more-than-32-characters';
const identity = { userId: 'u', orgId: 'o', clientId: 'c', jti: 'j' };
describe('McpServiceAuthService', () => {
  it('accepts only enabled, unexpired assertions signed with the dedicated secret', () => {
    const token = issueMcpServiceAssertion(identity, secret);
    const enabled = new McpServiceAuthService(
      new ConfigService({
        MCP_OAUTH_ENABLED: 'true',
        MCP_SERVICE_SECRET: secret,
      }),
    );
    expect(enabled.verify(token)).toMatchObject(identity);
    expect(
      enabled.verify(
        issueMcpServiceAssertion(identity, secret, Date.now() - 31_000),
      ),
    ).toBeNull();
    expect(
      enabled.verify(
        issueMcpServiceAssertion(
          identity,
          'another-mcp-secret-more-than-32-characters',
        ),
      ),
    ).toBeNull();
    expect(
      new McpServiceAuthService(
        new ConfigService({ MCP_SERVICE_SECRET: secret }),
      ).verify(token),
    ).toBeNull();
  });
  it('refuses missing, short or reused secrets at construction', () => {
    for (const value of [undefined, 'short']) {
      expect(
        () =>
          new McpServiceAuthService(
            new ConfigService({
              MCP_OAUTH_ENABLED: 'true',
              MCP_SERVICE_SECRET: value,
            }),
          ),
      ).toThrow();
    }
    expect(
      () =>
        new McpServiceAuthService(
          new ConfigService({
            MCP_SERVICE_SECRET: secret,
            SESSION_AUTH_SECRET: secret,
          }),
        ),
    ).toThrow();
  });
});
