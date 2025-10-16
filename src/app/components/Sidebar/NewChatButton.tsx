'use client';

import { useAppDispatch } from '@/store/hooks';
import { closeSidebar } from '@/store/sidebar/sidebarSlice';
import { NavbarItem } from '@ragenai/tui/navbar';
import { SidebarItem } from '@ragenai/tui/sidebar';

type NewChatButtonProps = {
  variant: 'navbar' | 'sidebar';
  children: React.ReactNode;
  'aria-label'?: string;
};

export const NewChatButton = ({
  variant,
  children,
  ...props
}: NewChatButtonProps) => {
  const dispatch = useAppDispatch();

  const handleNewChat = () => {
    dispatch(closeSidebar());
  };

  const Component = variant === 'navbar' ? NavbarItem : SidebarItem;

  return (
    <Component href="/" onClick={handleNewChat} {...props}>
      {children}
    </Component>
  );
};
