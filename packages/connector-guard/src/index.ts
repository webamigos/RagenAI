/**
 * The SSRF policy for connector URLs, and the two things that enforce it.
 *
 * It lived in `apps/api/src/connectors/` and nowhere else, while `apps/web`
 * opened MCP sessions of its own with no address check at all and `apps/admin`
 * is where a catalogue URL is now typed. Applying the policy to a catalogue
 * entry without moving it would have produced a third copy of the file this
 * spec complains about being copied — see
 * docs/specs/2026-09-18-mcp-servers-added-without-a-deploy.md.
 *
 * The check runs at three moments, and all three are needed:
 *
 *   1. save time, in `apps/admin`, so a typo or a metadata address is refused
 *      before it is stored;
 *   2. connect time, through `createGuardedMcpTransport`, because a public
 *      hostname can resolve to a private address later — DNS rebinding, which
 *      only the resolver's answer can see;
 *   3. every tool call for the life of the connector, which is the same
 *      transport.
 */
export {
  classifyAddress,
  isBlockedAddress,
  isBlockedHost,
  isPrivateOrLoopbackAddress,
  isPrivateOrLoopbackHost,
  type AddressKind,
  type AddressPolicy,
} from './private-address';

export {
  BLOCKED_ADDRESS_ERROR_NAME,
  BlockedAddressError,
  INSECURE_PROTOCOL_ERROR_NAME,
  InsecureProtocolError,
  createGuardedConnector,
  createGuardedFetch,
  createGuardedLookup,
  protocolsFor,
  type GuardedFetch,
  type GuardedFetchOptions,
} from './guarded-fetch';

export {
  createGuardedMcpTransport,
  isBlockedAddressError,
  isInsecureProtocolError,
  type GuardedMcpTransportOptions,
} from './guarded-mcp-transport';

export {
  probeMcpServer,
  type McpProbeOptions,
  type McpProbeResult,
} from './probe';
