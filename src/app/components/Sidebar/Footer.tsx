import * as Libs from '@salesyy/common-ui';

import { UserLinks } from '../UserLinks';

export const Footer = () => {
  return (
    <Libs.SidebarFooter>
      <Libs.SidebarSection>
        <div className="flex justify-between items-center">
          <Libs.Button isLink>
            <Libs.SidebarLabel>
              <UserLinks />
            </Libs.SidebarLabel>
          </Libs.Button>
        </div>
      </Libs.SidebarSection>
    </Libs.SidebarFooter>
  );
};
