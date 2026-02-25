import { ChatBubbleLeftIcon } from '@heroicons/react/24/outline';
import { SidebarItem, SidebarLabel } from '@ragenai/tui/sidebar';
import type { ThreadItemProps } from '../Projects/types';
import { getThreadTitle } from '../Projects/utils/threadUtils';

export const TUIThreadItem = ({
  thread,
  projectPublicId,
  isActive,
  onClose,
}: ThreadItemProps) => (
  <SidebarItem
    href={`/assistants/${projectPublicId}/threads/${thread.public_id}`}
    current={isActive}
    onClick={onClose}
    aria-label={`Thread: ${getThreadTitle(thread)}`}
    aria-current={isActive ? 'page' : undefined}
  >
    <ChatBubbleLeftIcon data-slot="icon" className="w-6 h-6" />
    <SidebarLabel>{getThreadTitle(thread)}</SidebarLabel>
  </SidebarItem>
);
