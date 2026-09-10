import { McpConnectorProvider } from '../../generated/prisma/client.js';
import type { ProviderDefinition } from '../types.js';

/**
 * Ported verbatim from apps/web's
 * src/features/connectors/providers/open-mercato.ts. See
 * docs/adrs/21-monorepo-and-api-decoupling.md.
 */
export const OPEN_MERCATO_PROVIDER: ProviderDefinition = {
  provider: McpConnectorProvider.OPEN_MERCATO,
  name: 'Open Mercato',
  description:
    'Look up customers, deals and orders from your Open Mercato CRM/ERP.',
  icon: 'building-2',
  mcpServerUrl: '',
  authType: 'api_key_custom_header',
  headerName: 'x-api-key',
  mcpServerUrlPath: '/mcp',
  singleTokenAuth: true,
  apiKeyHelpUrl: 'https://github.com/open-mercato/open-mercato',
  systemPromptFragment: `For Open Mercato (CRM/ERP/OMS):
- This connector exposes Open Mercato's own generic "search"/"execute" tools, which query its REST API across every enabled module (customers, deals, orders, custom entities). There are no fixed per-entity tools — read the tool descriptions at call time to see what's available.
- WRITES: "execute" can call mutating endpoints (create/update/delete). Confirm the exact intent with the user before writing anything; never guess IDs, statuses, or amounts.
- SCOPE: results are already scoped to the connected organization/tenant by the upstream server — don't ask the user which tenant, and don't pass a different one.
- If a call fails with a permission error, tell the user the connected API key may lack the required role rather than retrying blindly.`,
};
