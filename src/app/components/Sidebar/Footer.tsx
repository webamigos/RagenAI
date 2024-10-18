import { useTranslations } from 'next-intl';
import * as Libs from '@salesyy/common-ui';

import { UserLinks } from '../UserLinks';
import { truncateFileName } from '@/app/lib/utils/truncateFileName';

type Props = {
  isSignedIn?: boolean;
  userAvatar?: string;
  userEmail?: string;
};

export const Footer = ({ isSignedIn, userEmail, userAvatar }: Props) => {
  const t = useTranslations('my-profile-dialog');

  return (
    <Libs.SidebarFooter className="mb-10 lg:mb-5">
      <Libs.SidebarSection>
        <div className="flex justify-between items-center">
          {isSignedIn && userEmail && (
            <>
              <Libs.Dropdown>
                <Libs.DropdownButton as={Libs.SidebarItem}>
                  <span className="flex min-w-0 items-center gap-3">
                    <Libs.Avatar
                      src={userAvatar}
                      className="w-10 h-10 rounded-md"
                      alt="User Avatar"
                      square
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm/5 font-medium text-zinc-950 dark:text-white">
                        {userEmail?.split('@')[0] || 'User'}
                      </span>
                      <Libs.Tooltip
                        id="email"
                        place="bottom"
                        content={userEmail}
                        delayShow={500}
                      >
                        <span className="block truncate text-xs/5 font-normal text-zinc-500 dark:text-zinc-400">
                          {truncateFileName(userEmail, 28) ||
                            'email@example.com'}
                        </span>
                      </Libs.Tooltip>
                    </span>
                  </span>
                  <Libs.ChevronUpIcon />
                </Libs.DropdownButton>

                <Libs.DropdownMenu className="w-3/12" anchor="top end">
                  <Libs.DropdownItem className="cursor-pointe" href="/">
                    <Libs.HomeIcon />
                    <Libs.DropdownLabel className="text-sm ml-2.5">
                      {t('home-page')}
                    </Libs.DropdownLabel>
                  </Libs.DropdownItem>
                  <Libs.DropdownItem
                    href="/my-profile"
                    className="cursor-pointer"
                  >
                    <Libs.UserCircleIcon />
                    <Libs.DropdownLabel className="text-sm ml-2.5">
                      {t('my-profile')}
                    </Libs.DropdownLabel>
                  </Libs.DropdownItem>
                  <Libs.DropdownDivider />
                  <Libs.DropdownItem className="cursor-pointer">
                    <Libs.LogoutIcon />
                    <UserLinks />
                  </Libs.DropdownItem>
                </Libs.DropdownMenu>
              </Libs.Dropdown>
            </>
          )}

          {!isSignedIn && (
            <Libs.SidebarItem>
              <Libs.LogoutIcon />
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
