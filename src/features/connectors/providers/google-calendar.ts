import { McpConnectorProvider } from '@/generated/prisma/client';
import type { ProviderDefinition } from '../contracts/connector.types';
import { MCP_GOOGLE_AUTH_URL, MCP_GOOGLE_SERVER_URL } from './shared-config';

export const GOOGLE_CALENDAR_PROVIDER: ProviderDefinition = {
  provider: McpConnectorProvider.GOOGLE_CALENDAR,
  name: 'Google Calendar',
  description: 'View calendar events and check availability.',
  icon: 'calendar',
  mcpServerUrl: MCP_GOOGLE_SERVER_URL,
  authBaseUrl: MCP_GOOGLE_AUTH_URL,
  authPath: '/auth/google',
  scopes: [
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/calendar.events.readonly',
  ],
  systemPromptFragment: ({ timeZone }) => `For Google Calendar:
- TIMEZONE: Always pass timeZone="${timeZone}" in every calendar query (list_events, find_free_time, find_meeting_times, create_event, update_event).
- TIME RANGES: Always provide both timeMin and timeMax. For "today": use start/end of today. For "this week": use Monday to Sunday. For "tomorrow": use start/end of tomorrow. Format: YYYY-MM-DDTHH:MM:SS (no timezone suffix — timeZone param handles it).
- CONDENSED vs FULL: Use condenseEventDetails=true (default) for listing/overview queries. Use condenseEventDetails=false only when user asks for attendee details, attachments, or full event info.
- CREATING EVENTS: Always include timeZone in start and end objects. If user doesn't specify a time, ask for it. For all-day events use date format (YYYY-MM-DD).
- AVAILABILITY: For "when am I free?" use gcal_find_my_free_time. For "find a time with X" use gcal_find_meeting_times — don't manually scan events.`,
};
