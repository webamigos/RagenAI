'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Spinner } from '@/components/ui/spinner';
import { iconPathForProvider } from '@/features/connectors/utils/provider-icons';
import type { ActiveToolCall } from '@/store/tool-calls/toolCallsSlice';

type ToolCallChipProps = {
  call: ActiveToolCall;
};

/**
 * Small inline chip rendered while an MCP tool is executing — mirrors
 * the "Using GitHub…" indicator in Claude Desktop. Shows the provider
 * logo, a human-readable label, and a spinner. Removed from the UI
 * when the corresponding `tool_result` event fires (see
 * `handle-assistant-stream.ts`).
 *
 * Tool name format: `{providerSlug}__{toolName}` (e.g.
 * `rejestrio__lookup_company`). The provider slug becomes the icon
 * lookup key; the tool name tail becomes a display label.
 */
export function ToolCallChip({ call }: ToolCallChipProps) {
  const t = useTranslations('chat.tool-call');
  const iconPath = iconPathForProvider(call.provider);
  const [, ...toolParts] = call.toolName.split('__');
  const toolLabel = toolParts.join(' ').replace(/_/g, ' ') || call.toolName;

  return (
    <div
      className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
      role="status"
      aria-live="polite"
      aria-label={t('running', { tool: toolLabel })}
    >
      {iconPath ? (
        <Image
          src={iconPath}
          alt=""
          width={14}
          height={14}
          className="size-3.5 shrink-0"
          // Brand logos don't need alt text; the chip's aria-label
          // carries the semantic info.
          aria-hidden
        />
      ) : null}
      <span className="truncate font-medium">{toolLabel}</span>
      <Spinner className="size-3.5 text-zinc-500" />
    </div>
  );
}
