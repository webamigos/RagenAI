/**
 * Whether a chat turn may become a memory extraction (spec
 * 2026-09-27-personal-memory-across-threads, "Writing", step 2 and "Who a
 * memory belongs to"). One function, one test per condition.
 *
 * The ownership rule is the one that matters most. The chat loads a thread
 * by organization, not by owner, and threads can be shared, belong to a
 * team, or have a public link. A turn in someone else's thread must not
 * write into the owner's memory or the reader's, and an answer shaped by
 * one person's memory must not be saved where others read it — so memory
 * runs only in a thread the session user owns and nobody else can open.
 */

export interface MemoryGateThread {
  kind: string;
  source: string;
  chatbotId: string | null;
  /** The owner: the same field `ownThreadWhere` in apps/api reads. */
  visitorId: string | null;
  teamId: string | null;
  shareCount: number;
  hasPublicLink: boolean;
}

export type MemoryGateRefusal =
  | 'not-panel-chat'
  | 'not-owner'
  | 'not-private'
  | 'feature-off'
  | 'opted-out'
  | 'refused-turn';

export function memoryExtractionGate({
  thread,
  sessionUserId,
  featureOn,
  extractionEnabled,
  turnRefused,
}: {
  thread: MemoryGateThread;
  sessionUserId: string | null;
  featureOn: boolean;
  extractionEnabled: boolean;
  /** A guardrail or a usage ceiling refused the turn. */
  turnRefused: boolean;
}): MemoryGateRefusal | null {
  if (
    thread.kind !== 'CHAT' ||
    thread.source !== 'UI' ||
    thread.chatbotId !== null
  ) {
    return 'not-panel-chat';
  }
  if (!sessionUserId || thread.visitorId !== sessionUserId) {
    return 'not-owner';
  }
  if (thread.teamId !== null || thread.shareCount > 0 || thread.hasPublicLink) {
    return 'not-private';
  }
  if (!featureOn) {
    return 'feature-off';
  }
  if (!extractionEnabled) {
    return 'opted-out';
  }
  if (turnRefused) {
    return 'refused-turn';
  }
  return null;
}
