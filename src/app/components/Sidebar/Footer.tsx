import { useTranslations } from 'next-intl';
import * as Libs from '@salesyy/common-ui';

import { UserLinks } from '../UserLinks';

type Props = {
  isSignedIn?: boolean;
  userAvatar?: string;
  userEmail?: string;
};

export const Footer = ({ isSignedIn, userEmail, userAvatar }: Props) => {
  const t = useTranslations('my-profile-dialog');

  return (
    <Libs.SidebarFooter className=" lg:mb-5">
      <Libs.SidebarSection>
        <div className="flex justify-between items-center">
          {isSignedIn && (
            <>
              <Libs.Dropdown>
                <Libs.DropdownButton as={Libs.SidebarItem}>
                  <span className="flex min-w-0 items-center gap-3">
                    <Libs.Avatar
                      src={userAvatar}
                      className="w-10 h-10 rounded-full"
                      alt="User Avatar"
                      square
                    />
                    <span className="min-w-0">
                      <Libs.Text className="block truncate text-gray-600 text-sm font-medium text-zinc-950 dark:text-white">
                        {userEmail?.split('@')[0] || 'User'}
                      </Libs.Text>
                      <Libs.Text className="block truncate text-xs/5 text-gray-400 font-normal dark:text-zinc-400">
                        {userEmail || 'email@example.com'}
                      </Libs.Text>
                    </span>
                  </span>
                  <Libs.ChevronUpIcon />
                </Libs.DropdownButton>
                <Libs.DropdownMenu className="w-3/12" anchor="top end">
                  <Libs.DropdownItem
                    href="/my-profile"
                    className="cursor-pointer"
                  >
                    <Libs.UserCircleIcon />
                    <Libs.Text className="font-sans font-semibold hover:text-gray-600 text-sm text-gray-500 ml-2.5">
                      {t('my-profile')}
                    </Libs.Text>
                  </Libs.DropdownItem>
                  <Libs.DropdownItem className="cursor-pointer">
                    <UserLinks />
                  </Libs.DropdownItem>
                </Libs.DropdownMenu>
              </Libs.Dropdown>
            </>
          )}

          {!isSignedIn && (
            <Libs.SidebarItem>
              <Libs.SidebarLabel>
                <UserLinks />
              </Libs.SidebarLabel>
            </Libs.SidebarItem>
          )}
        </div>
      </Libs.SidebarSection>
    </Libs.SidebarFooter>
  );
};
