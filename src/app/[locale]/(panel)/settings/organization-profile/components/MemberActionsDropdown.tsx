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
      <MenuButton className="inline-flex items-center justify-center rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300">
        <EllipsisVerticalIcon className="h-5 w-5" aria-hidden="true" />
      </MenuButton>

      <MenuItems className="absolute right-0 z-10 mt-1 w-48 origin-top-right rounded-lg border border-zinc-200 bg-white py-1 shadow-lg focus:outline-none dark:border-zinc-700 dark:bg-zinc-900">
        {/* Change role options */}
        {member.role !== 'admin' && (
          <MenuItem>
            {({ focus }) => (
              <button
                onClick={() => onChangeRole(member.id, 'admin')}
                className={`${
                  focus ? 'bg-zinc-50 dark:bg-zinc-800' : ''
                } block w-full px-3 py-1.5 text-left text-sm text-zinc-700 dark:text-zinc-300`}
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
                  focus ? 'bg-zinc-50 dark:bg-zinc-800' : ''
                } block w-full px-3 py-1.5 text-left text-sm text-zinc-700 dark:text-zinc-300`}
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
                focus ? 'bg-zinc-50 dark:bg-zinc-800' : ''
              } block w-full px-3 py-1.5 text-left text-sm text-red-600 dark:text-red-400`}
            >
              {t('remove')}
            </button>
          )}
        </MenuItem>
      </MenuItems>
    </Menu>
  );
}
