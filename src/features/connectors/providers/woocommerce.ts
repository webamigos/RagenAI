import { McpConnectorProvider } from '@/generated/prisma/client';
import type { ProviderDefinition } from '../contracts/connector.types';

export const WOOCOMMERCE_PROVIDER: ProviderDefinition = {
  provider: McpConnectorProvider.WOOCOMMERCE,
  name: 'WooCommerce',
  description: 'Manage products and orders from your WooCommerce store.',
  icon: 'shopping-cart',
  // Per-connector URL — computed from the user's shop URL + mcpServerUrlPath
  // at registration time. The value here is only used as a placeholder.
  mcpServerUrl: '',
  authType: 'api_key_custom_header',
  headerName: 'X-MCP-API-Key',
  mcpServerUrlPath: '/wp-json/woocommerce/mcp',
  apiKeyHelpUrl:
    'https://woocommerce.com/document/woocommerce-rest-api/#section-2',
  systemPromptFragment: `For WooCommerce (store management):
- PRODUCTS: Use the product tools to list, search, or read product details. For "recent products" list sorted by date DESC and limit results to 20. For "out of stock" filter by stock_status="outofstock".
- ORDERS: Use the order tools to list and inspect orders. For "recent orders" use per_page=20 sorted by date DESC. For status questions filter by status (pending, processing, on-hold, completed, cancelled, refunded, failed). Always include date_created and total when listing.
- WRITES: Creating or updating products/orders has real effects on the live store. Confirm the exact intent with the user before calling any create/update tool; never guess SKUs, prices, or statuses.
- PERMISSIONS: The connected REST keys may be read-only. If a write call returns a permission error, tell the user to generate read_write keys in WooCommerce → Settings → Advanced → REST API rather than retrying.
- CURRENCY: Prices are returned as strings in the store's currency. Don't reformat or convert — display as-is.`,
};
