'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogTitle } from '@ragenai/common-ui/Dialog';
import { Button } from '@ragenai/common-ui/Button';
import { Input } from '@ragenai/common-ui/Input';
import { statusToast } from '@/app/lib/utils/toast';
import { authClient } from '@/app/hooks/use-better-auth';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  organizationId: string;
  onCreated: () => void;
};

export function CreateTeamDialog({
  isOpen,
  onClose,
  organizationId,
  onCreated,
}: Props) {
  const t = useTranslations('teams-page');
  const { successToast, errorToast } = statusToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      return;
    }

    setIsSubmitting(true);
    try {
      await authClient.organization.createTeam({
        name: name.trim(),
        organizationId,
      });
      successToast({ message: t('team-created') });
      setName('');
      onClose();
      onCreated();
    } catch {
      errorToast({ message: t('team-create-error') });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setName('');
    onClose();
  };

  return (
    <Dialog open={isOpen} onClose={handleClose} size="md">
      <DialogTitle>{t('create-team')}</DialogTitle>

      <form onSubmit={handleSubmit} className="space-y-6 mt-6">
        <div>
          <label
            htmlFor="team-name"
            className="block text-sm font-medium mb-2 text-foreground"
          >
            {t('team-name')}
          </label>
          <Input
            id="team-name"
            type="text"
            placeholder={t('team-name-placeholder')}
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isSubmitting}
          />
        </div>

        <div className="flex justify-end space-x-2">
          <Button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            plain
          >
            {t('cancel')}
          </Button>
          <Button isSubmit={true} disabled={isSubmitting || !name.trim()}>
            {isSubmitting ? t('creating') : t('create-team')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
