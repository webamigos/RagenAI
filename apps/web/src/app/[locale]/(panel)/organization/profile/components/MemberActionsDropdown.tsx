'use client';

import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import { EllipsisVerticalIcon } from '@heroicons/react/24/outline';
import { useTranslations } from 'next-intl';
import {
  ORG_ADMIN_ROLE,
  ORG_MEMBER_ROLE,
  canOwnOrg,
} from '@/lib/auth-access-control';
import type { Member } from '../types';

type Props = {
  member: Member;
  onRemove: () => void;
  onChangeRole: (
    memberId: string,
    newRole: typeof ORG_ADMIN_ROLE | typeof ORG_MEMBER_ROLE,
  ) => void;
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
      <MenuButton
        aria-label={t('actions')}
        className="inline-flex items-center justify-center rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-muted-foreground/90"
      >
        <EllipsisVerticalIcon className="h-5 w-5" aria-hidden="true" />
      </MenuButton>

      <MenuItems className="absolute right-0 z-10 mt-1 w-48 origin-top-right rounded-lg border border-border bg-card py-1 shadow-lg focus:outline-none">
        {/* Change role options */}
        {member.role !== ORG_ADMIN_ROLE && (
          <MenuItem>
            {({ focus }) => (
              <button
                onClick={() => onChangeRole(member.id, ORG_ADMIN_ROLE)}
                className={`${
                  focus ? 'bg-muted' : ''
                } block w-full px-3 py-1.5 text-left text-sm text-foreground`}
              >
                {t('change-to-admin')}
              </button>
            )}
          </MenuItem>
        )}
        {member.role !== ORG_MEMBER_ROLE && !canOwnOrg(member.role) && (
          <MenuItem>
            {({ focus }) => (
              <button
                onClick={() => onChangeRole(member.id, ORG_MEMBER_ROLE)}
                className={`${
                  focus ? 'bg-muted' : ''
                } block w-full px-3 py-1.5 text-left text-sm text-foreground`}
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
                focus ? 'bg-muted' : ''
              } block w-full px-3 py-1.5 text-left text-sm text-destructive`}
            >
              {t('remove')}
            </button>
          )}
        </MenuItem>
      </MenuItems>
    </Menu>
  );
}
