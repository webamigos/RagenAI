import { McpConnectorProvider } from '@/generated/prisma/client';
import type { ProviderDefinition } from '../contracts/connector.types';
import { MCP_CLICKUP_SERVER_URL } from './shared-config';

export const CLICKUP_PROVIDER: ProviderDefinition = {
  provider: McpConnectorProvider.CLICKUP,
  name: 'ClickUp',
  description: 'Manage tasks, projects, and workspaces.',
  icon: 'check-square',
  mcpServerUrl: MCP_CLICKUP_SERVER_URL,
  authType: 'external_mcp',
  systemPromptFragment: `For ClickUp:
- SORTING: When listing tasks, sort by updatedAt DESC by default to show most recently active items first.
- "MY TASKS": When the user says "my tasks" or uses first-person language, first call clickup_get_workspace_members to find the authenticated user's member ID, then use that ID as an assignee filter in clickup_search. If clickup_resolve_assignees is available, you can try it with the user's name — but do NOT use ["me"] as it may not be supported.
- ASSET TYPE: When the user asks about tasks specifically, filter by asset_types: ["task"]. When asking about docs, use ["doc"].
- STATUS FILTERING: For "current", "active", or "in progress" work, filter by task_statuses: ["active"]. For "todo" or "backlog", use ["unstarted"]. For "done" or "completed", use ["done", "closed"]. Don't filter by status when user asks for "all" tasks.
- DATE FILTERING: For "overdue tasks", filter with due_date_to set to today's date and task_statuses: ["unstarted", "active"]. For "tasks due this week", use due_date_from and due_date_to with the current week range.
- HIERARCHY: If the user mentions a specific space, folder, or list by name, use clickup_get_workspace_hierarchy or clickup_get_list/clickup_get_folder to resolve IDs, then filter by location.`,
};
