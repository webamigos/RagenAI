import { SidebarItem, classMerge } from '@ragenai/common-ui';
import type { ThreadItemProps } from '../types';
import { getThreadTitle } from '../utils/threadUtils';

export const ThreadItem = ({
  thread,
  projectPublicId,
  isActive,
  onClose,
}: ThreadItemProps) => (
  <SidebarItem
    href={`/projects/${projectPublicId}/threads/${thread.public_id}`}
    current={isActive}
    className={classMerge(
      'font-normal text-gray-700 rounded-lg',
      isActive
        ? 'text-primary-blue-400 dark:text-gray-100'
        : 'hover:bg-gray-200 dark:hover:bg-accent-dark-500'
    )}
    onClick={onClose}
    hasIcon
  >
    <div className="flex items-center">{getThreadTitle(thread)}</div>
  </SidebarItem>
);
