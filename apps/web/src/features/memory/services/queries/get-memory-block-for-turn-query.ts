import 'server-only';

import { logger } from '@/app/lib/utils/logger';
import { isFeatureEnabledQuery } from '@/features/subscriptions/services/queries/get-effective-features-query';
import { memoryExtractionGate } from '../../utils/memory-extraction-gate';
import { renderMemoryBlock } from '../../utils/render-memory-block';
import {
  getExtractionState,
  listMemories,
  memoryOwnerFromSession,
} from '../memory-scope';
import { getMemoryGateThreadQuery } from './get-memory-gate-thread-query';

/**
 * The memory block for this turn, or `''` (spec
 * 2026-09-27-personal-memory-across-threads, D1).
 *
 * The same gate as the write, minus the refusal condition, which is not
 * known yet: the session user's own private panel thread, the key on, the
 * user's switch on. A shared or team thread gets no block, so an answer
 * shaped by one person's memory is never saved where others read it.
 *
 * Never throws. Memory is never a reason for a turn to fail: an unavailable
 * owner key or any other error is logged by name and the turn runs without.
 */
export async function getMemoryBlockForTurnQuery({
  orgId,
  threadId,
}: {
  orgId: string;
  threadId: string;
}): Promise<string> {
  try {
    const owner = await memoryOwnerFromSession();
    if (owner.organizationId !== orgId) {
      return '';
    }
    const [thread, featureOn, state] = await Promise.all([
      getMemoryGateThreadQuery(threadId, orgId),
      isFeatureEnabledQuery(orgId, 'personalMemory'),
      getExtractionState(owner),
    ]);
    if (
      !thread ||
      memoryExtractionGate({
        thread,
        sessionUserId: owner.userId,
        featureOn,
        extractionEnabled: state.extractionEnabled,
        turnRefused: false,
      })
    ) {
      return '';
    }
    const memories = await listMemories(owner);
    return renderMemoryBlock(memories.map((memory) => memory.content));
  } catch (err) {
    logger.warn(
      { err: { name: (err as Error)?.name } },
      'getMemoryBlockForTurnQuery: the turn runs without memory',
    );
    return '';
  }
}
