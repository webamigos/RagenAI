import { createHmac, timingSafeEqual } from 'node:crypto';

export type McpServiceIdentity = {
  userId: string;
  orgId: string;
  projectId?: string;
  clientId: string;
  jti: string;
};
export type McpServiceAssertion = McpServiceIdentity & {
  typ: 'mcp';
  iat: number;
  exp: number;
};
const PREFIX = 'mcp.';
const TTL_SECONDS = 30;
function validIdentity(value: Record<string, unknown>): boolean {
  return (
    ['userId', 'orgId', 'clientId', 'jti'].every(
      (key) =>
        typeof value[key] === 'string' &&
        value[key].length > 0 &&
        value[key].length <= 2048,
    ) &&
    (value.projectId === undefined ||
      (typeof value.projectId === 'string' &&
        value.projectId.length > 0 &&
        value.projectId.length <= 2048))
  );
}
function sign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url');
}
/** Bound to a dedicated secret and namespace; never accepts session tokens. */
export function issueMcpServiceAssertion(
  identity: McpServiceIdentity,
  secret: string,
  now = Date.now(),
): string {
  if (secret.length < 32 || !validIdentity(identity)) {
    throw new Error('Invalid MCP service assertion configuration or identity');
  }
  const iat = Math.floor(now / 1000);
  const payload: McpServiceAssertion = {
    ...identity,
    typ: 'mcp',
    iat,
    exp: iat + TTL_SECONDS,
  };
  const body =
    PREFIX + Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(body, secret)}`;
}
export function verifyMcpServiceAssertion(
  token: string,
  secret: string | undefined,
  now = Date.now(),
): McpServiceAssertion | null {
  if (
    !secret ||
    secret.length < 32 ||
    token.length > 16384 ||
    !token.startsWith(PREFIX)
  ) {
    return null;
  }
  const parts = token.split('.');
  if (
    parts.length !== 3 ||
    !/^[A-Za-z0-9_-]+$/.test(parts[1]) ||
    !/^[A-Za-z0-9_-]{43}$/.test(parts[2])
  ) {
    return null;
  }
  const body = `${parts[0]}.${parts[1]}`;
  const expected = Buffer.from(sign(body, secret));
  const supplied = Buffer.from(parts[2]);
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  ) {
    return null;
  }
  try {
    const payload: unknown = JSON.parse(
      Buffer.from(parts[1], 'base64url').toString('utf8'),
    );
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return null;
    }
    const value = payload as Record<string, unknown>;
    const seconds = Math.floor(now / 1000);
    if (
      value.typ !== 'mcp' ||
      !validIdentity(value) ||
      !Number.isSafeInteger(value.iat) ||
      !Number.isSafeInteger(value.exp) ||
      (value.iat as number) > seconds + 5 ||
      (value.exp as number) <= seconds ||
      (value.exp as number) <= (value.iat as number) ||
      (value.exp as number) - (value.iat as number) > TTL_SECONDS
    ) {
      return null;
    }
    return value as McpServiceAssertion;
  } catch {
    return null;
  }
}
