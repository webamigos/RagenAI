'use client';

import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import { EllipsisVerticalIcon } from '@heroicons/react/24/outline';
import { useTranslations } from 'next-intl';
import type { Member } from '../types';

type Props = {
  member: Member;
  onRemove: () => void;
  onChangeRole: (memberId: string, newRole: 'admin' | 'member') => void;
  disabled: boolean;
};

export function MemberActionsDropdown({
  member,
  onRemove,
  onChangeRole,
  disabled,
}: Props) {
  const t = useTranslations('organization.members');

  if (disabled) {
    return null;
  }

  return (
    <Menu as="div" className="relative inline-block text-left">
      <MenuButton className="inline-flex items-center justify-center rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-300">
        <EllipsisVerticalIcon className="h-5 w-5" aria-hidden="true" />
      </MenuButton>

      <MenuItems className="absolute right-0 z-10 mt-2 w-56 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none dark:bg-gray-800 dark:ring-gray-700">
        <div className="py-1">
          {/* Change role options */}
          {member.role !== 'admin' && (
            <MenuItem>
              {({ focus }) => (
                <button
                  onClick={() => onChangeRole(member.id, 'admin')}
                  className={`${
                    focus ? 'bg-gray-100 dark:bg-gray-700' : ''
                  } block w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300`}
                >
                  {t('change-to-admin')}
                </button>
              )}
            </MenuItem>
          )}
          {member.role !== 'member' && member.role !== 'owner' && (
            <MenuItem>
              {({ focus }) => (
                <button
                  onClick={() => onChangeRole(member.id, 'member')}
                  className={`${
                    focus ? 'bg-gray-100 dark:bg-gray-700' : ''
                  } block w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300`}
                >
                  {t('change-to-member')}
                </button>
              )}
            </MenuItem>
          )}

          {/* Remove member */}
          <MenuItem>
            {({ focus }) => (
              <button
                onClick={onRemove}
                className={`${
                  focus ? 'bg-gray-100 dark:bg-gray-700' : ''
                } block w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400`}
              >
                {t('remove')}
              </button>
            )}
          </MenuItem>
        </div>
      </MenuItems>
    </Menu>
  );
}
