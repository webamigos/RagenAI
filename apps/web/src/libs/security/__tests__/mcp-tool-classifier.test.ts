import { describe, it, expect } from 'vitest';
import { classifyMcpTool, isWriteTool } from '../mcp-tool-classifier';

describe('classifyMcpTool — read-only tools', () => {
  // Every production read-only tool documented in provider-instructions.ts
  const readOnlyTools = [
    // Gmail (read-only per GMAIL_INSTRUCTIONS)
    'gmail__gmail_search_messages',
    'gmail__gmail_read_message',
    'gmail__gmail_read_thread',
    // Google Drive (explicitly read-only)
    'google_drive__drive_search_files',
    'google_drive__drive_read_file',
    // Google Calendar reads
    'google_calendar__gcal_list_events',
    'google_calendar__gcal_find_meeting_times',
    'google_calendar__gcal_find_my_free_time',
    // Google Analytics / Ads (reports)
    'google_analytics__get_traffic_report',
    'google_analytics__get_top_pages',
    'google_analytics__get_audience_insights',
    'google_ads__list_campaigns',
    'google_ads__get_campaign_performance',
    'google_ads__get_cost_summary',
    // HubSpot (read-only set currently exposed)
    'hubspot__search_crm_objects',
    'hubspot__get_crm_objects',
    'hubspot__get_user_details',
    'hubspot__get_properties',
    // ClickUp (search-only set currently exposed)
    'clickup__clickup_search',
    'clickup__clickup_get_workspace_members',
    'clickup__clickup_get_workspace_hierarchy',
    'clickup__clickup_get_list',
    'clickup__clickup_get_folder',
    // Fireflies reads
    'fireflies__fireflies_get_transcripts',
    'fireflies__fireflies_get_transcript',
    'fireflies__fireflies_fetch',
    'fireflies__fireflies_get_summary',
    'fireflies__fireflies_search',
    'fireflies__fireflies_get_user',
    // Slack reads
    'slack__slack_search_messages',
    'slack__slack_search_users',
    'slack__slack_list_channels',
  ];

  it.each(readOnlyTools)('classifies %s as read', (name) => {
    expect(classifyMcpTool(name)).toBe('read');
    expect(isWriteTool(name)).toBe(false);
  });
});

describe('classifyMcpTool — write tools', () => {
  const writeTools = [
    // Google Calendar writes
    'google_calendar__gcal_create_event',
    'google_calendar__gcal_update_event',
    'google_calendar__gcal_delete_event',
    // Gmail drafts / send (gated even though Gmail is currently read-only)
    'gmail__gmail_create_draft',
    'gmail__gmail_send_message',
    // Slack sends
    'slack__slack_send_message',
    'slack__slack_post_message',
    // Fireflies writes
    'fireflies__fireflies_create_soundbite',
    'fireflies__fireflies_move_meeting',
    'fireflies__fireflies_share_meeting',
    'fireflies__fireflies_revoke_meeting_access',
    'fireflies__fireflies_update_meeting_title',
    // HubSpot hypothetical writes
    'hubspot__hubspot_create_object',
    'hubspot__hubspot_update_object',
    'hubspot__hubspot_delete_object',
  ];

  it.each(writeTools)('classifies %s as write', (name) => {
    expect(classifyMcpTool(name)).toBe('write');
    expect(isWriteTool(name)).toBe(true);
  });
});

describe('classifyMcpTool — prefix handling', () => {
  it('strips the {provider}__ prefix before matching', () => {
    expect(classifyMcpTool('anything__gcal_create_event')).toBe('write');
    expect(classifyMcpTool('anything__gmail_search_messages')).toBe('read');
  });

  it('handles unprefixed tool names', () => {
    expect(classifyMcpTool('gcal_create_event')).toBe('write');
    expect(classifyMcpTool('gmail_search_messages')).toBe('read');
  });

  it('handles multiple __ sequences — only the first is treated as the prefix delimiter', () => {
    // Hypothetical tool name with multiple __ — only the first acts as
    // the provider delimiter, the rest must survive into the local name
    // and participate in classification.
    expect(classifyMcpTool('provider__nested__create_thing')).toBe('write');
    expect(classifyMcpTool('provider__nested__list_things')).toBe('read');
  });
});

describe('classifyMcpTool — pattern catch-all (new provider coverage)', () => {
  // Forward-looking: unknown tool from a new provider should still be
  // classified correctly based on verb at head.
  const patternSamples: Array<[string, 'read' | 'write']> = [
    ['hypothetical__new_create_resource', 'write'],
    ['hypothetical__new_update_thing', 'write'],
    ['hypothetical__new_delete_thing', 'write'],
    ['hypothetical__new_send_notification', 'write'],
    ['hypothetical__new_post_comment', 'write'],
    ['hypothetical__new_share_document', 'write'],
    ['hypothetical__new_publish_post', 'write'],
    ['hypothetical__new_insert_row', 'write'],
    ['hypothetical__new_upload_file', 'write'],
    // Reads with innocent names
    ['hypothetical__new_list_resources', 'read'],
    ['hypothetical__new_query_metrics', 'read'],
    ['hypothetical__new_describe_account', 'read'],
    ['hypothetical__new_lookup_id', 'read'],
  ];

  it.each(patternSamples)('classifies %s as %s', (name, expected) => {
    expect(classifyMcpTool(name)).toBe(expected);
  });
});

describe('classifyMcpTool — false-positive guards', () => {
  it('does not classify `get_created_events` as write (verb not at segment head)', () => {
    // This is the exact false positive that a naive substring check
    // would hit. The tool returns events that were *already created* —
    // pure read.
    expect(classifyMcpTool('hypothetical__get_created_events')).toBe('read');
  });

  it('does not classify `search_postings` as write', () => {
    expect(classifyMcpTool('hypothetical__search_postings')).toBe('read');
  });

  it('does not classify `discover_moves` as write', () => {
    // `move` appears but not as a standalone segment
    expect(classifyMcpTool('hypothetical__discover_moves')).toBe('read');
  });
});
