import {
  Popover,
  PopoverButton,
  PopoverPanel,
  CloseButton,
} from '@headlessui/react';
import { useTranslations } from 'next-intl';
import { SignOutButton } from '@clerk/nextjs';
import { Link } from '@/i18n/routing';
import { ArrowLeftEndOnRectangleIcon } from '@heroicons/react/24/outline';

import {
  Avatar,
  Text,
  UserCircleIcon,
  WrenchScrewdriverIcon,
} from '@ragenai/common-ui';

type Props = {
  userAvatar?: string;
  userEmail?: string;
};

export const UserMenu = ({ userAvatar, userEmail }: Props) => {
  const t = useTranslations();

  return (
    <Popover className="relative">
      <PopoverButton
        data-testid="avatar-icon"
        className="block text-sm/6 font-semibold text-white/50 focus:outline-none data-[active]:text-white data-[hover]:text-white data-[focus]:outline-1 data-[focus]:outline-white"
      >
        <Avatar
          className="w-9 h-9 mr-1 hidden sm:flex cursor-pointer group-hover:opacity-100"
          src={userAvatar}
        />
      </PopoverButton>
      <PopoverPanel className="absolute top-12 -right-1 z-50 w-44 divide-y dark:divide-white/5 divide-accent-dark-100 rounded-xl dark:bg-[#253745] bg-[#f6f6f8] text-sm/6 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
        <div className="p-3">
          <Text
            fontSize="sm"
            className="text-primary-blue-500 dark:text-gray-500 whitespace-nowrap pt-2 px-3"
          >
            {t('Index.welcome')}
          </Text>
          <Text fontSize="sm" className="mr-2 whitespace-nowrap py-2 px-3">
            {userEmail?.split('@')[0] || 'User'}
          </Text>
        </div>
        <div className="p-3">
          <CloseButton
            className="block rounded-md py-2 px-3 transition hover:bg-white/5"
            as={Link}
            href="/my-profile"
          >
            <p className="flex text-gray-500 hover:text-gray-600 dark:text-slate-200 dark:hover:text-white">
              <UserCircleIcon className="mr-3 h-5 w-5" />
              {t('sidebar.profile')}
            </p>
          </CloseButton>
        </div>
        <div className="p-3">
          <CloseButton
            className="block rounded-md py-2 px-3 transition hover:bg-white/5"
            as={Link}
            href="/support"
          >
            <p className="flex text-gray-500 hover:text-gray-600 dark:text-slate-200 dark:hover:text-white">
              <WrenchScrewdriverIcon className="mr-3 h-5 w-5" />
              {t('sidebar.support-page')}
            </p>
          </CloseButton>
        </div>
        <div className="p-3">
          <SignOutButton>
            <span className="flex px-3 text-gray-500 hover:text-gray-600 dark:text-slate-200 dark:hover:text-white cursor-pointer">
              <ArrowLeftEndOnRectangleIcon className="mr-3 h-5 w-5" />
              {t('common.sign-out')}
            </span>
          </SignOutButton>
        </div>
      </PopoverPanel>
    </Popover>
  );
};
