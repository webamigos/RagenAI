'use client';

import { useSearchThreads } from '@/app/hooks/useSearchThreadsContext';
import { useAppDispatch } from '@/store/hooks';
import { closeSidebar } from '@/store/sidebar/sidebarSlice';
import { NavbarItem } from '@ragenai/tui/navbar';
import { SidebarItem } from '@ragenai/tui/sidebar';

type SearchButtonProps = {
  variant: 'navbar' | 'sidebar';
  children: React.ReactNode;
  'aria-label'?: string;
};

export const SearchButton = ({
  variant,
  children,
  ...props
}: SearchButtonProps) => {
  const { openSearch } = useSearchThreads();
  const dispatch = useAppDispatch();

  const handleSearch = () => {
    openSearch();
    dispatch(closeSidebar());
  };

  const Component = variant === 'navbar' ? NavbarItem : SidebarItem;

  return (
    <Component onClick={handleSearch} {...props}>
      {children}
    </Component>
  );
};
