'use client';

import { NavbarItem } from '@ragenai/tui/navbar';
import { SidebarItem } from '@ragenai/tui/sidebar';
import { useMobileSidebar } from '@ragenai/tui/sidebar-layout';

type ChatButtonProps = {
  variant: 'navbar' | 'sidebar';
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

  const Component = variant === 'navbar' ? NavbarItem : SidebarItem;

  return (
    <Component href="/new" onClick={handleNewChat} {...props}>
      {children}
    </Component>
  );
};
