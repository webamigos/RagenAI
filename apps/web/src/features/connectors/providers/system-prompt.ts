import type { ProviderDefinition } from '../contracts/connector.types';

/**
 * `definitions` is the resolved catalogue keyed by slug — a row merged with
 * its behaviour pack. It is passed in rather than read from the registry
 * because the prompt fragment for a connector an operator added lives on its
 * row, and the registry only knows the eleven that ship with Ragen.
 */
export function buildMcpContext(
  connectorProviders: string[],
  timeZone: string,
  currentDateTime: string,
  definitions: Record<string, ProviderDefinition> = {},
): string {
  const header = `You have access to external tools via connected integrations (${connectorProviders.join(', ')}). Authentication is handled automatically — just call the tools directly without any credentials.

Current date and time: ${currentDateTime} (timezone: ${timeZone}). Use this to resolve relative dates like "today", "tomorrow", "this week", etc. when calling calendar or other time-based tools. Always provide both time_min and time_max for calendar queries to get precise results.`;

  const sections: string[] = [header];

  for (const providerId of connectorProviders) {
    const fragment = definitions[providerId]?.systemPromptFragment;
    if (!fragment) {
      continue;
    }
    sections.push(
      typeof fragment === 'function' ? fragment({ timeZone }) : fragment,
    );
  }

  return sections.join('\n\n');
}
