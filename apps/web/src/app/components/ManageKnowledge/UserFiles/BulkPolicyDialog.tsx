'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { PiiPolicySelect, type PiiPolicyValue } from '../PiiPolicySelect';

type Props = {
  isOpen: boolean;
  isLoading?: boolean;
  count: number;
  onClose: () => void;
  onConfirm: (policy: PiiPolicyValue, reprocess: boolean) => void;
};

/**
 * Change the PII policy across a selection.
 *
 * The reprocess checkbox is the bulk form of what the row does. A policy
 * describes what to strip while a file is being parsed, so changing it leaves
 * the already-indexed text exactly as it was — the row makes that visible by
 * revealing a Reprocess button the moment the select changes, and here the
 * same fact is a checked box the person can uncheck. Defaulting it to on is
 * the honest default: a policy that has not been applied to anything is not a
 * policy, and someone changing it on forty files means the forty files.
 */
export const BulkPolicyDialog = (props: Props) => {
  /*
    Mounted only while open, so each opening starts from the defaults.

    The state used to outlive the dialog: pick STRICT, cancel, select three
    other files and open it again, and the select still read STRICT over a
    different selection — with an Apply button that would have written it.
    Remounting is the reset; an effect watching `isOpen` would do the same job
    with a render in the middle of it.

    The cost is the close animation, which Radix cannot play on a subtree that
    is already gone. For a dialog whose Cancel is one click from the thing it
    was covering, that is not a cost worth an effect.
  */
  if (!props.isOpen) {
    return null;
  }

  return <BulkPolicyDialogForm {...props} />;
};

const BulkPolicyDialogForm = ({
  isOpen,
  isLoading,
  count,
  onClose,
  onConfirm,
}: Props) => {
  const t = useTranslations('bulk-policy-modal');
  const [policy, setPolicy] = useState<PiiPolicyValue>('TOXIC_ONLY');
  const [reprocess, setReprocess] = useState(true);

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isLoading) {
          onClose();
        }
      }}
    >
      {/*
        No corner × while the change is running. `onOpenChange` already refuses
        to close mid-flight, so the button was there to be clicked and do
        nothing — and the two footer buttons say what is happening, which a
        disabled × cannot.
      */}
      <DialogContent showCloseButton={!isLoading}>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description', { count })}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <PiiPolicySelect
            value={policy}
            onChange={setPolicy}
            disabled={isLoading}
            showInfoLink
          />

          <label className="flex items-start gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={reprocess}
              disabled={isLoading}
              onChange={(e) => setReprocess(e.target.checked)}
              data-testid="bulk-policy-reprocess"
              className="mt-0.5 size-4 rounded border-border text-primary focus:ring-ring"
            />
            <span>
              {t('reprocess-label')}
              <span className="block text-xs text-muted-foreground">
                {t('reprocess-hint')}
              </span>
            </span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            {t('cancel')}
          </Button>
          <Button
            onClick={() => onConfirm(policy, reprocess)}
            disabled={isLoading}
            data-testid="bulk-policy-confirm"
          >
            {isLoading ? t('applying') : t('apply', { count })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
