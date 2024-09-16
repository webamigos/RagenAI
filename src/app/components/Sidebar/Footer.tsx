import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  SidebarSection,
  Avatar,
  SidebarFooter,
  SidebarLabel,
  SidebarItem,
  Dropdown,
  DropdownButton,
  DropdownMenu,
  DropdownItem,
  DropdownLabel,
  DropdownDivider,
  LogoutIcon,
  ChevronUpIcon,
  UserCircleIcon,
  Dialog,
  DialogTitle,
  DialogBody,
  DialogActions,
  Button,
} from '@salesyy/common-ui';
import { UserLinks } from '../UserLinks';
import { LockClosed } from '@salesyy/common-ui/icons/LockClosed';
import { ChangePasswordForm } from './MyProfile';

type Props = {
  isSignedIn?: boolean;
  userEmail?: string;
  userAvatar?: string;
};

export const Footer = ({ isSignedIn, userEmail, userAvatar }: Props) => {
  const t = useTranslations('dialog');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [passwordForm, setPasswordForm] = useState(false);

  const handleOpenDialog = () => {
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setPasswordForm((prevState) => !prevState);
  };

  const handlePasswordForm = () => {
    setPasswordForm((prevState) => !prevState);
  };

  return (
    <SidebarFooter className="mb-10 lg:mb-5">
      <SidebarSection>
        <div className="flex justify-between items-center">
          {isSignedIn && (
            <>
              <Dropdown>
                <DropdownButton as={SidebarItem}>
                  <span className="flex min-w-0 items-center gap-3">
                    <Avatar
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
                  <ChevronUpIcon />
                </DropdownButton>

                <DropdownMenu className="w-2/12" anchor="top end">
                  <DropdownItem
                    className="cursor-pointer"
                    onClick={handleOpenDialog}
                  >
                    <UserCircleIcon />
                    <DropdownLabel className="text-sm ml-2.5">
                      {t('my-profile')}
                    </DropdownLabel>
                  </DropdownItem>
                  <DropdownDivider />
                  <DropdownItem className="cursor-pointer">
                    <LogoutIcon />
                    <UserLinks />
                  </DropdownItem>
                </DropdownMenu>
              </Dropdown>

              {/* Dialog */}
              <Dialog
                className="p-6"
                open={isDialogOpen}
                onClose={handleCloseDialog}
                size="md"
              >
                <DialogTitle>
                  {!passwordForm ? t('my-profile') : t('change-password')}
                </DialogTitle>
                {!passwordForm ? (
                  <DialogBody>
                    <SidebarItem onClick={handlePasswordForm}>
                      <LockClosed />
                      {t('change-password')}
                      <ChevronUpIcon className="w-4 h-4 ml-auto transform rotate-90" />
                    </SidebarItem>
                  </DialogBody>
                ) : (
                  <ChangePasswordForm handleCloseDialog={handleCloseDialog} />
                )}
                <DialogActions>
                  <Button
                    className="p-2 text-sm"
                    label={t('close')}
                    onClick={handleCloseDialog}
                  />
                </DialogActions>
              </Dialog>
            </>
          )}

          {!isSignedIn && (
            <SidebarItem>
              <LogoutIcon />
              <SidebarLabel>
                <UserLinks />
              </SidebarLabel>
            </SidebarItem>
          )}
        </div>
      </SidebarSection>
    </SidebarFooter>
  );
};
