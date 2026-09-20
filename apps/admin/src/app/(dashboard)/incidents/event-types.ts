import {
  BLOCKED_HIT_EVENT,
  FLAGGED_HIT_EVENT,
  GUARDRAIL_SECURITY_EVENT_TYPES,
} from '@ragenai/guardrails/contracts';

import { SecurityEventType } from '../../../../../web/src/generated/prisma/enums';

/**
 * What this page can filter by, and the one place a filter value is believed.
 *
 * It used to be a free-text box holding whatever was in the query string, cast
 * with `as never` and handed to Prisma. Two things followed. A typo — or a
 * link somebody edited — reached the driver as an unknown enum value and threw,
 * so the incidents page answered a mistyped filter with a stack trace. And the
 * types nobody could spell were unreachable: `GUARDRAIL_FLAGGED` is the row
 * that makes observation mode worth anything, and the only way to see it was
 * to know it existed and type it exactly.
 *
 * Both halves are fixed here rather than on the page, because the CSV export
 * builds the same `where` from the same query string and was casting the same
 * way. A filter the page accepts and the export rejects is a download that
 * quietly does not match the table it came from.
 */

/**
 * The two a guardrail writes, from the package that decides between them.
 *
 * Not `SecurityEventType.GUARDRAIL_BLOCKED`, and not a literal: an app naming
 * either one is what `guardrails-are-not-recopied` forbids, because an app
 * that can spell them is an app that can decide between them. Re-exported here
 * so this page's filter and the hit counts on the guardrails page cannot come
 * to disagree about which events are a guardrail's.
 */
export const GUARDRAIL_EVENT_TYPES = GUARDRAIL_SECURITY_EVENT_TYPES;

/**
 * "Both guardrail types", which is not an enum member.
 *
 * An operator asking what the rules did means blocked *and* flagged — a block
 * count alone reads as "the guardrails caught four things" while the twelve a
 * `LOG` rule noticed are invisible. Filtering to one at a time is still
 * offered; this is the question people actually arrive with.
 */
export const GUARDRAILS_FILTER = 'guardrails';

export type EventTypeFilter = SecurityEventType | { in: SecurityEventType[] };

const ALL_EVENT_TYPES = Object.values(SecurityEventType);

function isEventType(value: string): value is SecurityEventType {
  return (ALL_EVENT_TYPES as string[]).includes(value);
}

/**
 * An unrecognized value narrows nothing instead of throwing.
 *
 * The select can only produce values this accepts, so anything else is a
 * hand-edited URL or a stale bookmark. Showing every event is a worse answer
 * than showing the right ones and a better one than showing an error page —
 * and the alternative, a refusal, would have to be rendered by a page whose
 * job is to render a table.
 */
export function parseEventTypeFilter(
  value: string | null | undefined,
): EventTypeFilter | undefined {
  if (!value) {
    return undefined;
  }
  if (value === GUARDRAILS_FILTER) {
    // Copied rather than handed over: Prisma's filter takes a mutable array,
    // and the constant is the app's shared list.
    return { in: [...GUARDRAIL_EVENT_TYPES] };
  }
  return isEventType(value) ? value : undefined;
}

type EventTypeGroup = {
  readonly label: string;
  readonly options: readonly { value: string; label: string }[];
};

/**
 * Grouped the way the enum itself is grouped, so the list reads as a set of
 * subjects rather than 26 shouted constants. Every member appears exactly
 * once — `event-types.test.ts` asserts that, because a member added to the
 * schema and forgotten here is a filter that silently cannot be selected,
 * which is the failure this file was written to end.
 */
export const EVENT_TYPE_GROUPS: readonly EventTypeGroup[] = [
  {
    label: 'Guardrails',
    options: [
      { value: GUARDRAILS_FILTER, label: 'Any guardrail hit' },
      { value: BLOCKED_HIT_EVENT, label: 'Blocked a turn' },
      { value: FLAGGED_HIT_EVENT, label: 'Flagged, allowed' },
    ],
  },
  {
    label: 'Auth and access',
    options: [
      { value: SecurityEventType.AUTH_LOGIN_FAILED, label: 'Login failed' },
      {
        value: SecurityEventType.AUTH_BRUTEFORCE_SUSPECTED,
        label: 'Bruteforce suspected',
      },
      {
        value: SecurityEventType.AUTH_PASSWORD_RESET_REQUESTED,
        label: 'Password reset requested',
      },
      {
        value: SecurityEventType.AUTH_ADMIN_ROLE_GRANTED,
        label: 'Platform role granted',
      },
      {
        value: SecurityEventType.AUTH_ADMIN_ROLE_REVOKED,
        label: 'Platform role revoked',
      },
      {
        value: SecurityEventType.CROSS_ORG_ACCESS_ATTEMPTED,
        label: 'Cross-organization access attempted',
      },
      {
        value: SecurityEventType.UNAUTHORIZED_ACCESS_ATTEMPTED,
        label: 'Unauthorized access attempted',
      },
    ],
  },
  {
    label: 'Chat and models',
    options: [
      {
        value: SecurityEventType.CHAT_JAILBREAK_DETECTED,
        label: 'Jailbreak detected',
      },
      { value: SecurityEventType.CHAT_PII_DETECTED, label: 'PII detected' },
      {
        value: SecurityEventType.CHAT_PII_MASKING_FAILED,
        label: 'PII masking failed',
      },
      {
        value: SecurityEventType.TOOL_CALL_BLOCKED,
        label: 'Tool call blocked',
      },
      {
        value: SecurityEventType.TOOL_CALL_CONFIRMED,
        label: 'Tool call confirmed',
      },
      { value: SecurityEventType.TOOL_CALL_DENIED, label: 'Tool call denied' },
      {
        value: SecurityEventType.TOOL_ARGS_HIGH_RISK,
        label: 'Tool arguments high risk',
      },
    ],
  },
  {
    label: 'Ingest',
    options: [
      {
        value: SecurityEventType.UPLOAD_SUSPICIOUS_CONTENT,
        label: 'Suspicious upload',
      },
      { value: SecurityEventType.UPLOAD_REJECTED, label: 'Upload rejected' },
    ],
  },
  {
    label: 'API keys',
    options: [
      { value: SecurityEventType.API_KEY_CREATED, label: 'API key created' },
      { value: SecurityEventType.API_KEY_REVOKED, label: 'API key revoked' },
      {
        value: SecurityEventType.API_INTERNAL_SECRET_MISMATCH,
        label: 'Internal secret mismatch',
      },
    ],
  },
  {
    label: 'Administration',
    options: [
      {
        value: SecurityEventType.ADMIN_SETTINGS_CHANGED,
        label: 'Settings changed',
      },
      {
        value: SecurityEventType.ADMIN_USER_ACTION,
        label: 'Action taken on an account',
      },
    ],
  },
  {
    label: 'Infrastructure',
    options: [
      { value: SecurityEventType.RATE_LIMIT_HIT, label: 'Rate limit hit' },
      { value: SecurityEventType.MCP_OAUTH_FAILED, label: 'MCP OAuth failed' },
      {
        value: SecurityEventType.ENCRYPTION_REQUIREMENT_BYPASSED,
        label: 'Encryption requirement bypassed',
      },
    ],
  },
];
