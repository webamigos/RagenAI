'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@ragenai/common-ui/Button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { EllipsisHorizontalIcon } from '@heroicons/react/24/outline';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { statusToast } from '@/app/lib/utils/toast';
import { authClient } from '@/app/hooks/use-better-auth';
import { AddTeamMemberDialog } from './AddTeamMemberDialog';
import type { TeamDetails } from '@/features/teams/contracts/team.types';

type OrgMember = {
  id: string;
  userId: string;
  name?: string;
  email: string;
};

type Props = {
  team: TeamDetails;
  orgMembers: OrgMember[];
  canManage: boolean;
  onBack: () => void;
  onRefresh: () => void;
};

export function TeamDetail({
  team,
  orgMembers,
  canManage,
  onBack,
  onRefresh,
}: Props) {
  const t = useTranslations('teams-page');
  const { successToast, errorToast } = statusToast();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isRemoveDialogOpen, setIsRemoveDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<{
    userId: string;
    name: string;
  } | null>(null);

  const handleRemoveMember = useCallback(
    async (userId: string) => {
      setRemovingUserId(userId);
      setIsRemoveDialogOpen(false);
      setMemberToRemove(null);
      try {
        await authClient.organization.removeTeamMember({
          teamId: team.id,
          userId,
        });
        successToast({ message: t('member-removed') });
        onRefresh();
      } catch {
        errorToast({ message: t('member-remove-error') });
      } finally {
        setRemovingUserId(null);
      }
    },
    [team.id, successToast, errorToast, onRefresh, t],
  );

  const handleDeleteTeam = useCallback(async () => {
    setIsDeleting(true);
    try {
      await authClient.organization.removeTeam({
        teamId: team.id,
      });
      successToast({ message: t('team-deleted') });
      onBack();
    } catch {
      errorToast({ message: t('team-delete-error') });
    } finally {
      setIsDeleting(false);
      setIsDeleteDialogOpen(false);
    }
  }, [team.id, successToast, errorToast, onBack]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <button
          onClick={onBack}
          className="text-sm text-zinc-500 transition-colors hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white"
        >
          &larr; {t('back-to-teams')}
        </button>
        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-zinc-950 dark:text-white">
              {team.name}
            </h2>
            <span className="text-sm text-zinc-500 dark:text-zinc-400">
              ({t('member-count', { count: team.members.length })})
            </span>
          </div>
          <div className="flex gap-2">
            {canManage && (
              <>
                <Button
                  outline
                  onClick={() => setIsDeleteDialogOpen(true)}
                  className="!border-red-200 !text-red-600 hover:!bg-red-50 dark:!border-red-800 dark:!text-red-400 dark:hover:!bg-red-950/30"
                >
                  {t('delete-team')}
                </Button>
                <Button onClick={() => setIsAddDialogOpen(true)}>
                  {t('add-member')}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Members list */}
      {team.members.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {t('no-members')}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {team.members.map((member) => (
            <div key={member.id} className="flex items-center gap-3 py-3">
              {/* Avatar */}
              {member.userImage ? (
                <img
                  src={member.userImage}
                  alt={member.userName || member.userEmail}
                  className="h-9 w-9 shrink-0 rounded-full"
                />
              ) : (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-200 dark:bg-zinc-700">
                  <span className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
                    {(member.userName ||
                      member.userEmail ||
                      '?')[0].toUpperCase()}
                  </span>
                </div>
              )}

              {/* User info */}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-zinc-950 dark:text-white">
                  {member.userName || member.userEmail}
                </div>
                {member.userName && (
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">
                    {member.userEmail}
                  </div>
                )}
              </div>

              {/* Joined date */}
              <span className="hidden shrink-0 text-xs text-zinc-400 sm:block dark:text-zinc-500">
                {new Date(member.joinedAt).toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}
              </span>

              {/* Actions */}
              {canManage && (
                <div className="shrink-0">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        disabled={removingUserId === member.userId}
                        className="rounded p-1 transition-colors hover:bg-zinc-200 disabled:opacity-50 dark:hover:bg-zinc-700"
                      >
                        <EllipsisHorizontalIcon className="size-5 text-zinc-500 dark:text-zinc-400" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuItem
                        onClick={() => {
                          setMemberToRemove({
                            userId: member.userId,
                            name: member.userName || member.userEmail,
                          });
                          setIsRemoveDialogOpen(true);
                        }}
                        className="!text-red-600 dark:!text-red-400"
                      >
                        {t('remove')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <AddTeamMemberDialog
        isOpen={isAddDialogOpen}
        onClose={() => setIsAddDialogOpen(false)}
        teamId={team.id}
        existingMemberIds={team.members.map((m) => m.userId)}
        orgMembers={orgMembers}
        onAdded={onRefresh}
      />

      {/* Remove member confirmation dialog */}
      <AlertDialog
        open={isRemoveDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsRemoveDialogOpen(false);
            setMemberToRemove(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('remove-member-title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('remove-member-confirm', {
                name: memberToRemove?.name ?? '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (memberToRemove) {
                  handleRemoveMember(memberToRemove.userId);
                }
              }}
              className="border-red-300 bg-transparent text-red-600 hover:bg-red-600 hover:text-white dark:border-red-700 dark:text-red-400 dark:hover:bg-red-600 dark:hover:text-white"
            >
              {t('remove')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete team confirmation dialog */}
      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsDeleteDialogOpen(false);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('delete-team')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('delete-team-confirm', { name: team.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              {t('cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTeam}
              disabled={isDeleting}
              className="border-red-300 bg-transparent text-red-600 hover:bg-red-600 hover:text-white dark:border-red-700 dark:text-red-400 dark:hover:bg-red-600 dark:hover:text-white"
            >
              {t('delete-team')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
