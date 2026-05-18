import { SidebarItem, SidebarLabel } from '@ragenai/tui/sidebar';
import { useMobileSidebar } from '@ragenai/tui/sidebar-layout';
import type { ThreadItemProps } from '../Projects/types';
import { getThreadTitle } from '../Projects/utils/threadUtils';

export const TUIThreadItem = ({
  thread,
  projectId: _projectId,
  isActive,
}: ThreadItemProps) => {
  const { closeSidebar } = useMobileSidebar();
  const teamName =
    'team' in thread &&
    (thread as { team?: { name: string } | null }).team?.name;

  return (
    <SidebarItem
      href={`/chats/${thread.id}`}
      current={isActive}
      onClick={closeSidebar}
      aria-label={`Thread: ${getThreadTitle(thread)}`}
      aria-current={isActive ? 'page' : undefined}
    >
      <SidebarLabel className="font-normal">
        {getThreadTitle(thread)}
      </SidebarLabel>
      {teamName && (
        <span className="ml-auto shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
          {teamName}
        </span>
      )}
    </SidebarItem>
  );
};
