'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { statusToast } from '@/app/lib/utils/toast';
import {
  shareProject,
  revokeProjectShare,
  getProjectPermissions,
} from '@/app/actions/project-permissions';
import { getOrgMembersAndTeams } from '@/app/actions/permissions';
import type {
  ProjectPermissionItem,
  ProjectPermissionLevel,
} from '@/features/projects/contracts/project-permission.types';

type OrgMember = { id: string; name: string | null; email: string };
type OrgTeam = { id: string; name: string };

type Props = {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  projectTitle: string;
  ownerName?: string;
};

export function ShareAccessDialog({
  isOpen,
  onClose,
  projectId,
  projectTitle,
  ownerName,
}: Props) {
  const t = useTranslations('share-access-dialog');

  // Map known server-side error prose to localized strings. Anything we
  // don't recognize falls back to the generic share-failed message so we
  // never expose untranslated backend text. When the backend grows stable
  // error codes, switch this to a code lookup.
  const translateError = (raw: string | undefined): string => {
    if (raw === 'Owner already has full access') {
      return t('owner-already-has-access');
    }
    if (raw === 'User is not a member of this organization') {
      return t('user-not-org-member');
    }
    if (raw === 'Team not found') {
      return t('team-not-found');
    }
    return t('share-failed');
  };
  const { successToast, errorToast } = statusToast();
  const [permissions, setPermissions] = useState<ProjectPermissionItem[]>([]);
  const [orgMembers, setOrgMembers] = useState<OrgMember[]>([]);
  const [orgTeams, setOrgTeams] = useState<OrgTeam[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPermission, setSelectedPermission] =
    useState<ProjectPermissionLevel>('view');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadPermissions = useCallback(async () => {
    try {
      const perms = await getProjectPermissions(projectId);
      setPermissions(perms);
    } catch {
      setPermissions([]);
      errorToast({ message: t('share-failed') });
    }
  }, [projectId, errorToast, t]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    loadPermissions();
    getOrgMembersAndTeams()
      .then(({ members, teams }) => {
        setOrgMembers(members);
        setOrgTeams(teams);
      })
      .catch(() => {
        setOrgMembers([]);
        setOrgTeams([]);
      });
    setSearchQuery('');
  }, [isOpen, loadPermissions]);

  // Exclude users who already have access so the list shows only valid
  // share targets.
  const grantedUserIds = new Set(
    permissions.filter((p) => p.granteeType === 'user').map((p) => p.granteeId),
  );
  const grantedTeamIds = new Set(
    permissions.filter((p) => p.granteeType === 'team').map((p) => p.granteeId),
  );

  const q = searchQuery.toLowerCase();
  const visibleMembers = orgMembers
    .filter((m) => !grantedUserIds.has(m.id))
    .filter(
      (m) =>
        !q ||
        m.name?.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q),
    );
  const visibleTeams = orgTeams
    .filter((tm) => !grantedTeamIds.has(tm.id))
    .filter((tm) => !q || tm.name.toLowerCase().includes(q));

  const handleShare = async (
    granteeType: 'user' | 'team',
    granteeId: string,
  ) => {
    setIsSubmitting(true);
    try {
      const result = await shareProject(
        projectId,
        granteeType,
        granteeId,
        selectedPermission,
      );
      if (result.success) {
        successToast({ message: t('shared-success') });
        await loadPermissions();
        setSearchQuery('');
      } else {
        errorToast({ message: translateError(result.error) });
      }
    } catch {
      errorToast({ message: t('share-failed') });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevoke = async (permissionId: string) => {
    try {
      const result = await revokeProjectShare(parseInt(permissionId, 10));
      if (result.success) {
        successToast({ message: t('revoke-success') });
        await loadPermissions();
      } else {
        errorToast({ message: result.error || t('revoke-failed') });
      }
    } catch {
      errorToast({ message: t('revoke-failed') });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg top-[15%] translate-y-0 sm:top-[15%]">
        <DialogHeader>
          <DialogTitle>{t('title', { title: projectTitle })}</DialogTitle>
          <DialogDescription className="sr-only">
            {t('title', { title: projectTitle })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2 items-center">
            <div className="flex-1">
              <Input
                type="text"
                placeholder={t('search-placeholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Select
              value={selectedPermission}
              onValueChange={(value) =>
                setSelectedPermission(value as ProjectPermissionLevel)
              }
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="view">{t('permission-view')}</SelectItem>
                <SelectItem value="full">{t('permission-full')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {visibleMembers.length === 0 && visibleTeams.length === 0 && (
            <p className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
              {t('empty-list')}
            </p>
          )}

          {(visibleMembers.length > 0 || visibleTeams.length > 0) && (
            <div className="max-h-40 overflow-y-auto border rounded-md dark:border-border">
              {visibleTeams.map((team) => (
                <button
                  key={`team-${team.id}`}
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleShare('team', team.id)}
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted"
                >
                  <span className="w-8 h-8 rounded-full bg-accent dark:bg-primary/15 flex items-center justify-center text-xs font-medium text-primary">
                    T
                  </span>
                  <div className="text-left">
                    <div className="font-medium text-foreground">
                      {team.name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t('team-badge')}
                    </div>
                  </div>
                </button>
              ))}
              {visibleMembers.map((member) => (
                <button
                  key={`user-${member.id}`}
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleShare('user', member.id)}
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted"
                >
                  <span className="w-8 h-8 rounded-full bg-paper-200 dark:bg-paper-700 flex items-center justify-center text-xs font-medium text-muted-foreground">
                    {(member.name || member.email).charAt(0).toUpperCase()}
                  </span>
                  <div className="text-left">
                    <div className="font-medium text-foreground">
                      {member.name || member.email}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {member.email}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          <div>
            <h4 className="text-sm font-medium text-foreground mb-2">
              {t('who-has-access')}
            </h4>
            <div className="space-y-2">
              {ownerName && (
                <div className="flex items-center justify-between px-3 py-2 rounded-md bg-muted">
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-full bg-ready-tint dark:bg-ready/15 flex items-center justify-center text-xs font-medium text-ready">
                      {ownerName.charAt(0).toUpperCase()}
                    </span>
                    <div>
                      <div className="text-sm font-medium text-foreground">
                        {ownerName}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {t('owner')}
                      </div>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {t('permission-full')}
                  </span>
                </div>
              )}

              {permissions.map((perm) => (
                <div
                  key={perm.id}
                  className="flex items-center justify-between px-3 py-2 rounded-md bg-muted"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${
                        perm.granteeType === 'team'
                          ? 'bg-accent dark:bg-primary/15 text-primary'
                          : 'bg-paper-200 dark:bg-paper-700 text-muted-foreground'
                      }`}
                    >
                      {perm.granteeType === 'team'
                        ? 'T'
                        : perm.granteeName.charAt(0).toUpperCase()}
                    </span>
                    <div>
                      <div className="text-sm font-medium text-foreground">
                        {perm.granteeName}
                      </div>
                      {perm.granteeEmail && (
                        <div className="text-xs text-muted-foreground">
                          {perm.granteeEmail}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {perm.permission === 'full'
                        ? t('permission-full')
                        : t('permission-view')}
                    </span>
                    <button
                      onClick={() => handleRevoke(perm.id)}
                      className="text-destructive hover:text-destructive/90 text-xs"
                    >
                      {t('remove')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button
            type="button"
            onClick={onClose}
            className="bg-brand-600 text-primary-foreground hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-400"
          >
            {t('done')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
