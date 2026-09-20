/**
 * This app's view of the shared MCP connector catalogue.
 *
 * The values are catalogue slugs, because `allowedConnectors` is compared
 * against `McpConnector.providerSlug`. This list is the eleven built-ins, and
 * it is the *seed's* input rather than the catalogue itself — an entry an
 * operator adds is a row and is not here. Its labels and icon paths live in
 * `@ragenai/platform-contracts` (ADR-33), where a test checks them against the
 * seeded catalogue.
 */
export { CONNECTOR_LIST as allConnectors } from '@ragenai/platform-contracts';

export type { ConnectorDefinition } from '@ragenai/platform-contracts';
