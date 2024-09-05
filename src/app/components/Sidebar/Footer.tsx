import {
  SidebarFooter,
  SidebarSection,
  SidebarLabel,
  SidebarItem,
} from '@salesyy/common-ui';
import { LogoutIcon } from '@salesyy/common-ui';

import { UserLinks } from '../UserLinks';

type Props = {
  isSignedIn?: boolean;
  userEmail?: string;
};

export const Footer = ({ isSignedIn, userEmail }: Props) => {
  return (
    <SidebarFooter className="mb-10">
      <SidebarSection>
        <div className="flex justify-between items-center">
          {isSignedIn && <SidebarLabel>{userEmail}</SidebarLabel>}
          <SidebarItem>
            <LogoutIcon />
            <SidebarLabel>
              <UserLinks />
            </SidebarLabel>
          </SidebarItem>
        </div>
      </SidebarSection>
    </SidebarFooter>
  );
};
