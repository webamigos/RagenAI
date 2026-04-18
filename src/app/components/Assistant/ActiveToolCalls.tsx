'use client';

import { useAppSelector } from '@/store/hooks';
import { ToolCallChip } from './ToolCallChip';

type ActiveToolCallsProps = {
  threadId: string;
};

/**
 * Renders the live "Using {tool}…" chip row for the currently
 * streaming assistant turn. Subscribes to the `toolCalls` Redux slice
 * and renders one `ToolCallChip` per active (unresolved) tool call.
 *
 * Returns null when there are no active calls, so it's safe to drop
 * into the DOM unconditionally near the streaming bubble — it
 * doesn't eat vertical space when idle.
 */
export function ActiveToolCalls({ threadId }: ActiveToolCallsProps) {
  const calls = useAppSelector(
    (state) => state.toolCalls.activeByThread[threadId] ?? [],
  );

  if (calls.length === 0) {
    return null;
  }

  return (
    <div className="mr-auto flex max-w-[90%] flex-wrap items-center gap-2">
      {calls.map((call) => (
        <ToolCallChip key={call.toolCallId} call={call} />
      ))}
    </div>
  );
}
