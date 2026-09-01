import { McpConnectorProvider } from '@/generated/prisma/client';
import type { ProviderDefinition } from '../contracts/connector.types';
import { MCP_FIREFLIES_SERVER_URL } from './shared-config';

export const FIREFLIES_PROVIDER: ProviderDefinition = {
  provider: McpConnectorProvider.FIREFLIES,
  name: 'Fireflies.ai',
  description: 'Search meeting transcripts, summaries, and action items.',
  icon: 'mic',
  mcpServerUrl: MCP_FIREFLIES_SERVER_URL,
  authType: 'api_key_bearer',
  apiKeyHelpUrl:
    'https://docs.fireflies.ai/getting-started/quickstart#obtaining-authentication-credentials',
  systemPromptFragment: `For Fireflies.ai (meeting transcripts):
- CRITICAL: When calling any Fireflies tool, ONLY pass the parameters you truly need. Omit all optional parameters — do NOT pass empty strings, zeros, false, or empty arrays.
- LISTING TRANSCRIPTS: Call fireflies_get_transcripts with ONLY {"limit": 10}. No other parameters. This returns the user's recent transcripts.
- "MY MEETINGS" / "RECENT MEETINGS": Same as above — just call fireflies_get_transcripts with {"limit": 10}. All transcripts belong to the authenticated user.
- TRANSCRIPT DETAILS: Use fireflies_get_transcript with a transcriptId for full transcript. Use fireflies_fetch with an id for complete meeting data (transcript + summary + metadata) in one call.
- SUMMARIES: Use fireflies_get_summary with a transcriptId for summary, action items, keywords, and topics.
- SEARCHING: Use fireflies_search with a query string. Supports keyword, date ranges, and participant filters.
- DATE FILTERING: Use fromDate and toDate in ISO 8601 format (e.g., "2026-01-01") only when the user explicitly asks about a specific time period.
- USER INFO: Use fireflies_get_user (no parameters) if you need the user's email or account details.`,
};
