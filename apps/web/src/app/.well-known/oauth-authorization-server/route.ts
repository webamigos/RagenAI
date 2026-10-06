import { auth } from '@/lib/auth';
import { mcpDiscovery } from '@/lib/mcp-discovery';

export const dynamic = 'force-dynamic';
export function GET(request: Request) {
  return mcpDiscovery(request, 'oauth-authorization-server', auth.handler);
}
export const HEAD = GET;
