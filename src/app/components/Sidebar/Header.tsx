import { SidebarHeader } from '@ragenai/common-ui/Sidebar';

import { Logo } from '../Logo';

export const Header = () => {
  return (
    <SidebarHeader className="mx-4">
      <Logo className="h-10" />
    </SidebarHeader>
  );
};
