import { SidebarHeader } from '@salesyy/common-ui';

import { Logo } from '../Logo';
import { NavHeader } from '../NavHeader';

export const Header = () => {
  return (
    <SidebarHeader className="mx-4">
      <div className="flex justify-between items-center">
        <Logo />
        <NavHeader />
      </div>
    </SidebarHeader>
  );
};
