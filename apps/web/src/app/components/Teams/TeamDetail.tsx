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
// Team budget/limits/allowed-models settings are managed from ragen-admin,
// not from the user-facing app. See apps/admin (follow-up if not yet present).
// import { TeamSettingsSection } from './TeamSettingsSection';
import type { TeamDetails } from '@/features/teams/contracts/team.types';
import type { AvailableModel } from '@/app/components/config';

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
  availableModels: AvailableModel[];
  onBack: () => void;
  onRefresh: () => void;
};

export function TeamDetail({
  team,
  orgMembers,
  canManage,
  availableModels,
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
  }, [team.id, successToast, errorToast, onBack, t]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <button
          onClick={onBack}
          className="text-sm text-muted-foreground transition-colors hover:text-foreground dark:hover:text-white"
        >
          &larr; {t('back-to-teams')}
        </button>
        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-foreground dark:text-white">
              {team.name}
            </h2>
            <span className="text-sm text-muted-foreground">
              ({t('member-count', { count: team.members.length })})
            </span>
          </div>
          <div className="flex gap-2">
            {canManage && (
              <>
                {!team.id.endsWith('-general') && (
                  <Button
                    outline
                    onClick={() => setIsDeleteDialogOpen(true)}
                    className="!border-destructive/40 !text-destructive hover:!bg-crimson-50 dark:hover:!bg-crimson-950/30"
                  >
                    {t('delete-team')}
                  </Button>
                )}
                <Button onClick={() => setIsAddDialogOpen(true)}>
                  {t('add-member')}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Team settings (budget, RPM/TPM, allowed models) moved to ragen-admin. */}

      {/* Members list */}
      {team.members.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-sm text-muted-foreground">{t('no-members')}</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
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
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-paper-200 dark:bg-paper-700">
                  <span className="text-sm font-medium text-muted-foreground">
                    {(member.userName ||
                      member.userEmail ||
                      '?')[0].toUpperCase()}
                  </span>
                </div>
              )}

              {/* User info */}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-foreground dark:text-white">
                  {member.userName || member.userEmail}
                </div>
                {member.userName && (
                  <div className="text-xs text-muted-foreground">
                    {member.userEmail}
                  </div>
                )}
              </div>

              {/* Joined date */}
              <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
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
                        className="rounded p-1 transition-colors hover:bg-paper-200 disabled:opacity-50 dark:hover:bg-paper-700"
                      >
                        <EllipsisHorizontalIcon className="size-5 text-muted-foreground" />
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
                        className="!text-destructive"
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
              className="border-destructive/40 bg-transparent text-destructive hover:bg-destructive hover:text-white dark:hover:text-white"
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
              className="border-destructive/40 bg-transparent text-destructive hover:bg-destructive hover:text-white dark:hover:text-white"
            >
              {t('delete-team')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
