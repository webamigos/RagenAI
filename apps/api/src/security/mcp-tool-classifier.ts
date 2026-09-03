/**
 * Ported verbatim from apps/web's src/libs/security/mcp-tool-classifier.ts
 * — pure logic, no imports in the original. See
 * docs/adrs/21-monorepo-and-api-decoupling.md.
 *
 * Classify an MCP tool name as either `read` (safe, no side effects) or
 * `write` (causes a user-visible side effect outside this app — sends a
 * message, creates a record, modifies remote state).
 *
 * The classifier is used by the Phase 2 tool-gating layer in
 * `../mcp/client.ts`: write tools get a `needsApproval` predicate
 * that pauses execution when retrieved RAG context is present in the
 * turn, which is the prompt-injection exfiltration vector we're
 * closing.
 *
 * Tools are registered at runtime with a provider prefix, e.g.
 *   google_calendar__gcal_create_event
 *   gmail__gmail_search_messages
 *
 * This classifier accepts either the prefixed or unprefixed form and
 * strips the prefix before matching.
 *
 * Strategy
 * ---------
 * Three layers, checked in order:
 *   1. EXPLICIT_READ — hardcoded list of tools known to be read-only
 *      even when their name contains a verb like "search" or "get".
 *      Used for tools whose name happens to collide with a write verb.
 *   2. EXPLICIT_WRITE — hardcoded list of tools known to have side
 *      effects, used for tools whose pattern we might otherwise miss.
 *   3. WRITE_PATTERNS — regex patterns against common write verbs
 *      (`_create`, `_send`, `_delete`, etc.). This is the catch-all
 *      so that new write tools added by a provider upstream are
 *      gated by default — fail safe.
 *
 * The default for an unrecognized tool that matches no pattern is
 * `read`. We considered defaulting to `write` (maximally safe) but
 * that would block every read-only tool the moment someone adds a new
 * MCP provider, and the operational pain would be severe. Instead we
 * accept the small residual risk that a novel write verb slips past
 * the pattern, and rely on the provider's own naming conventions
 * (which uniformly use `create`/`update`/`delete`/`send` across the
 * current set) to stay compatible.
 */

/**
 * Strip the `{provider}__` prefix if present. The prefix is added by
 * `wrapToolsForConnector` in `../mcp/client.ts` at registration time.
 */
function stripProviderPrefix(toolName: string): string {
  const idx = toolName.indexOf('__');
  return idx >= 0 ? toolName.slice(idx + 2) : toolName;
}

/**
 * Tools whose names include a write-looking verb but are actually
 * read-only. Add entries here when a pattern false-positives.
 */
const EXPLICIT_READ = new Set<string>([
  // e.g. "gmail_search_messages" does not match any write pattern — nothing
  // to list here yet. Kept as a documented override point for future tools
  // whose names collide with a write verb (`get_created_after`, etc.).
]);

/**
 * Tools known to have side effects. Used as an allowlist even when the
 * name doesn't match a write pattern. Keep this list in sync with
 * `../mcp/provider-instructions.ts` when new write tools ship.
 */
const EXPLICIT_WRITE = new Set<string>([
  // Google Calendar (from GOOGLE_CALENDAR_INSTRUCTIONS)
  'gcal_create_event',
  'gcal_update_event',
  'gcal_delete_event',
  // Gmail — currently documented as read-only, but keep gmail_create_draft
  // listed so it is gated the moment a draft-capable variant is enabled.
  'gmail_create_draft',
  'gmail_send_message',
  // Slack — SLACK_INSTRUCTIONS mentions sending messages; exact tool name
  // depends on the Slack MCP provider. List the common variants so any of
  // them get gated.
  'slack_send_message',
  'slack_post_message',
  // Fireflies — write operations documented on its MCP server
  'fireflies_create_soundbite',
  'fireflies_move_meeting',
  'fireflies_share_meeting',
  'fireflies_revoke_meeting_access',
  'fireflies_update_meeting_title',
  // HubSpot write-variants not currently enabled but listed for safety
  'hubspot_create_object',
  'hubspot_update_object',
  'hubspot_delete_object',
]);

/**
 * Regex patterns against common write verbs. Matched against the
 * *unprefixed* tool name. Each pattern expects either a word boundary
 * or an underscore on at least one side so it doesn't match accidental
 * substrings (e.g. `get_created_objects` would hit `_create` and be
 * incorrectly gated).
 *
 * NOTE: `_create_` would false-positive on `get_created_objects`.
 * To avoid that, we require the verb to appear either at the start of
 * the tool name or immediately after the first underscore (the
 * verb-object form MCP providers use: `create_event`, `send_message`,
 * `delete_file`).
 */
const WRITE_VERB_HEADS = [
  'create',
  'update',
  'delete',
  'remove',
  'send',
  'post',
  'share',
  'revoke',
  'move',
  'add',
  'write',
  'publish',
  'insert',
  'upload',
  'grant',
];

function matchesWriteVerbAtHead(name: string): boolean {
  // The verb must be a whole segment between underscores or at either
  // end of the tool name. Examples that should match:
  //   create_event, event_create, gcal_create_event
  // Examples that should NOT match:
  //   get_created_events, search_postings, discover_moves
  const segments = name.split('_');
  for (const verb of WRITE_VERB_HEADS) {
    if (segments.includes(verb)) {
      return true;
    }
  }
  return false;
}

export type McpToolSideEffect = 'read' | 'write';

export function classifyMcpTool(toolName: string): McpToolSideEffect {
  const local = stripProviderPrefix(toolName);

  if (EXPLICIT_READ.has(local)) {
    return 'read';
  }
  if (EXPLICIT_WRITE.has(local)) {
    return 'write';
  }
  if (matchesWriteVerbAtHead(local)) {
    return 'write';
  }
  return 'read';
}

/**
 * Convenience predicate used at the call site.
 */
export function isWriteTool(toolName: string): boolean {
  return classifyMcpTool(toolName) === 'write';
}
