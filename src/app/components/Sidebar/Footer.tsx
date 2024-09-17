import { useState } from 'react';
import { useTranslations } from 'next-intl';
import * as Libs from '@salesyy/common-ui';

import { UserLinks } from '../UserLinks';
import { ChangePasswordForm } from './MyProfile';

type Props = {
  isAdmin?: boolean;
  isSignedIn?: boolean;
  userAvatar?: string;
  userEmail?: string;
};

export const Footer = ({
  isSignedIn,
  userEmail,
  userAvatar,
  isAdmin,
}: Props) => {
  const t = useTranslations('dialog');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [passwordForm, setPasswordForm] = useState(false);

  const handleOpenDialog = () => {
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setPasswordForm(false);
  };

  const handlePasswordForm = () => {
    setPasswordForm((prevState) => !prevState);
  };

  return (
    <Libs.SidebarFooter className="mb-10 lg:mb-5">
      <Libs.SidebarSection>
        <div className="flex justify-between items-center">
          {isSignedIn && (
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
                      <span className="block truncate text-xs/5 font-normal text-zinc-500 dark:text-zinc-400">
                        {userEmail || 'email@example.com'}
                      </span>
                    </span>
                  </span>
                  <Libs.ChevronUpIcon />
                </Libs.DropdownButton>

                <Libs.DropdownMenu className="w-3/12" anchor="top end">
                  {isAdmin && (
                    <Libs.DropdownItem className="cursor-pointer">
                      <Libs.SettingsIcon />
                      <Libs.DropdownLabel className="text-sm ml-2.5">
                        {t('admin-dashboard')}
                      </Libs.DropdownLabel>
                    </Libs.DropdownItem>
                  )}
                  <Libs.DropdownItem
                    className="cursor-pointer"
                    onClick={handleOpenDialog}
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

              {/* Dialog */}
              <Libs.Dialog
                className="p-6"
                open={isDialogOpen}
                onClose={handleCloseDialog}
                size="md"
              >
                <Libs.DialogTitle>
                  {!passwordForm ? t('my-profile') : t('change-password')}
                </Libs.DialogTitle>
                {!passwordForm ? (
                  <Libs.DialogBody>
                    <Libs.SidebarItem onClick={handlePasswordForm}>
                      <Libs.LockClosedIcon />
                      {t('change-password')}
                      <Libs.ChevronUpIcon className="w-4 h-4 ml-auto transform rotate-90" />
                    </Libs.SidebarItem>
                  </Libs.DialogBody>
                ) : (
                  <ChangePasswordForm handleCloseDialog={handleCloseDialog} />
                )}
                <Libs.DialogActions>
                  <Libs.Button
                    className="p-2 text-sm"
                    label={t('close')}
                    onClick={handleCloseDialog}
                  />
                </Libs.DialogActions>
              </Libs.Dialog>
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
