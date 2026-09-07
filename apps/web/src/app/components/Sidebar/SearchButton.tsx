'use client';

import { useSearchThreads } from '@/app/hooks/useSearchThreadsContext';
import { NavbarItem } from '@ragenai/common-ui/Navbar';
import { SidebarItem } from '@ragenai/common-ui/Sidebar';
import { useMobileSidebar } from '@ragenai/common-ui/SidebarLayout';

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
  const { closeSidebar } = useMobileSidebar();

  const handleSearch = () => {
    openSearch();
    closeSidebar();
  };

  const Component = variant === 'navbar' ? NavbarItem : SidebarItem;

  return (
    <Component onClick={handleSearch} {...props}>
      {children}
    </Component>
  );
};
