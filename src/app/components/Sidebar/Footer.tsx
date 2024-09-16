import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Avatar,
  SidebarFooter,
  SidebarSection,
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

type Props = {
  isSignedIn?: boolean;
  userEmail?: string;
  userAvatar?: string;
};

export const Footer = ({ isSignedIn, userEmail, userAvatar }: Props) => {
  const t = useTranslations('dialog');
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleOpenDialog = () => {
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
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
                  <DropdownItem onClick={handleOpenDialog}>
                    <UserCircleIcon />
                    <DropdownLabel className="text-sm ml-2.5">
                      {t('my-profile')}
                    </DropdownLabel>
                  </DropdownItem>
                  <DropdownDivider />
                  <DropdownItem>
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
                <DialogTitle>{t('my-profile')}</DialogTitle>
                <DialogBody>
                  <SidebarItem>
                    <LockClosed />
                    {t('change-password')}
                    <ChevronUpIcon className="w-4 h-4 ml-auto transform rotate-90" />
                  </SidebarItem>
                </DialogBody>
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
