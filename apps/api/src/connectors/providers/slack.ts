import { McpConnectorProvider } from '../../generated/prisma/client.js';
import type { ProviderDefinition } from '../types.js';
import { MCP_SLACK_SERVER_URL } from './shared-config.js';

export const SLACK_PROVIDER: ProviderDefinition = {
  provider: McpConnectorProvider.SLACK,
  name: 'Slack',
  description: 'Search messages, channels, and send messages.',
  icon: 'message-square',
  mcpServerUrl: MCP_SLACK_SERVER_URL,
  authType: 'external_mcp',
  oauthClientId: process.env.SLACK_MCP_CLIENT_ID,
  oauthClientSecret: process.env.SLACK_MCP_CLIENT_SECRET,
  useUserScope: true,
  scopes: [
    'search:read.public',
    'search:read.private',
    'channels:history',
    'groups:history',
    'mpim:history',
    'im:history',
    'users:read',
  ],
  systemPromptFragment: `For Slack:
- SEARCHING: Use search tools to find messages, files, users, and channels. Provide relevant keywords from the user's query.
- "MY MESSAGES": When user says "my messages" or uses first-person language, search for messages from the authenticated user.
- CHANNELS: When searching for messages in a specific channel, use the channel name filter. If the user mentions a channel by name, search for it first.
- THREADS: When the user asks about a conversation or wants full context, read the entire thread, not just individual messages.
- SENDING MESSAGES: When the user asks to send a message, confirm the channel and content before sending. Always double-check the target channel.
- CANVASES: Use canvas tools for creating or reading structured documents within Slack.
- USER LOOKUP: When the user asks about a specific person, use user search/profile tools to find them by name or email.`,
};
