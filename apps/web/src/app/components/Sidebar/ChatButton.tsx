'use client';

import { Link } from '@/i18n/routing';
import { NavbarItem } from '@ragenai/common-ui/Navbar';
import { SidebarItem } from '@ragenai/common-ui/Sidebar';
import { useMobileSidebar } from '@ragenai/common-ui/SidebarLayout';

type ChatButtonProps = {
  /**
   * `primary` is the filled treatment, and it is the only filled element in
   * the sidebar. Starting a conversation is what this product is for; as a
   * plain `SidebarItem` it carried exactly the same weight as Search and
   * Notifications, so nothing in the panel read as the thing to do.
   */
  variant: 'navbar' | 'sidebar' | 'primary';
  children: React.ReactNode;
  'aria-label'?: string;
};

export const ChatButton = ({
  variant,
  children,
  ...props
}: ChatButtonProps) => {
  const { closeSidebar } = useMobileSidebar();

  const handleNewChat = () => {
    closeSidebar();
  };

  if (variant === 'primary') {
    return (
      <Link
        href="/new"
        onClick={handleNewChat}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-ink-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring dark:hover:bg-paper-200"
        {...props}
      >
        {children}
      </Link>
    );
  }

  const Component = variant === 'navbar' ? NavbarItem : SidebarItem;

  return (
    <Component href="/new" onClick={handleNewChat} {...props}>
      {children}
    </Component>
  );
};
