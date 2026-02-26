import { SidebarItem, SidebarLabel } from '@ragenai/tui/sidebar';
import type { ThreadItemProps } from '../Projects/types';
import { getThreadTitle } from '../Projects/utils/threadUtils';

export const TUIThreadItem = ({
  thread,
  projectPublicId: _projectPublicId,
  isActive,
  onClose,
}: ThreadItemProps) => (
  <SidebarItem
    href={`/chats/${thread.public_id}`}
    current={isActive}
    onClick={onClose}
    aria-label={`Thread: ${getThreadTitle(thread)}`}
    aria-current={isActive ? 'page' : undefined}
  >
    <SidebarLabel className="font-normal">
      {getThreadTitle(thread)}
    </SidebarLabel>
  </SidebarItem>
);
