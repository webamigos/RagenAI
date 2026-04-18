import { type McpConnectorProvider } from '@/generated/prisma/client';
import { PROVIDER_REGISTRY } from './registry';

function isKnownProvider(value: string): value is McpConnectorProvider {
  return value in PROVIDER_REGISTRY;
}

export function buildMcpContext(
  connectorProviders: string[],
  timeZone: string,
  currentDateTime: string,
): string {
  const header = `You have access to external tools via connected integrations (${connectorProviders.join(', ')}). Authentication is handled automatically — just call the tools directly without any credentials.

Current date and time: ${currentDateTime} (timezone: ${timeZone}). Use this to resolve relative dates like "today", "tomorrow", "this week", etc. when calling calendar or other time-based tools. Always provide both time_min and time_max for calendar queries to get precise results.`;

  const sections: string[] = [header];

  for (const providerId of connectorProviders) {
    if (!isKnownProvider(providerId)) {
      continue;
    }
    const fragment = PROVIDER_REGISTRY[providerId].systemPromptFragment;
    if (!fragment) {
      continue;
    }
    sections.push(
      typeof fragment === 'function' ? fragment({ timeZone }) : fragment,
    );
  }

  return sections.join('\n\n');
}
