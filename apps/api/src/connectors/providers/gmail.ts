import { McpConnectorProvider } from '../../generated/prisma/client.js';
import type { ProviderDefinition } from '../types.js';
import { MCP_GOOGLE_AUTH_URL, MCP_GOOGLE_SERVER_URL } from './shared-config.js';

export const GMAIL_PROVIDER: ProviderDefinition = {
  provider: McpConnectorProvider.GMAIL,
  name: 'Gmail',
  description: 'Search emails and read messages.',
  icon: 'mail',
  mcpServerUrl: MCP_GOOGLE_SERVER_URL,
  authBaseUrl: MCP_GOOGLE_AUTH_URL,
  authPath: '/auth/google',
  scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
  systemPromptFragment: `For Gmail:
- RECENT EMAILS: When user asks for "recent emails" or "latest messages", call gmail_search_messages with no query (q omitted) to get most recent messages.
- SEARCH SYNTAX: Use Gmail search operators: from:, to:, subject:, is:unread, is:starred, has:attachment, after:YYYY/M/D, before:YYYY/M/D. Combine with spaces for AND, OR for alternatives.
- DATE QUERIES: For "emails from today", use after: with today's date in YYYY/M/D format. For "emails this week", calculate the Monday date.
- THREADS: When the user asks about a conversation or wants full context, use gmail_read_thread with the threadId from search results, not just gmail_read_message.
- READ-ONLY: Gmail access is read-only. You can search and read emails but cannot send, draft, or modify messages.`,
};
