/**
 * This app's view of the shared MCP connector catalogue.
 *
 * The values must match the `McpConnectorProvider` enum in the shared schema,
 * because `allowedConnectors` is compared against `McpConnector.provider`. That
 * list, its labels and its icon paths live in `@ragenai/platform-contracts`
 * (ADR-33), where a test checks them against `schema.prisma` directly.
 */
export { CONNECTOR_LIST as allConnectors } from '@ragenai/platform-contracts';

export type { ConnectorDefinition } from '@ragenai/platform-contracts';
