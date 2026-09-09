'use client';

import { useTranslations } from 'next-intl';

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

/**
 * One confirmation dialog for the whole application.
 *
 * Five destructive actions used the browser's `confirm()` — removing a member
 * from an organization, cancelling an invitation, archiving a document,
 * rejecting an invitation and rolling a document back to an earlier version.
 * A native `confirm()` ignores the theme, cannot be translated beyond the one
 * string, blocks the main thread, is unstyleable, and a browser that has
 * decided the page shows too many dialogs suppresses it entirely — after
 * which the guarded action silently never runs.
 *
 * The destructive styling lives here rather than at each call site, where it
 * had already been pasted six times.
 */

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What is about to happen. Radix requires a title for the announcement. */
  title: string;
  description: string;
  /** Defaults to the shared "confirm"/"cancel" labels. */
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red action, for anything that removes or overwrites. */
  destructive?: boolean;
  onConfirm: () => void;
};

const DESTRUCTIVE_ACTION =
  'border-destructive/40 bg-transparent text-destructive hover:bg-destructive hover:text-destructive-foreground';

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  destructive = false,
  onConfirm,
}: Props) {
  const t = useTranslations('common');

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel ?? t('cancel')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className={destructive ? DESTRUCTIVE_ACTION : undefined}
          >
            {confirmLabel ?? t('confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
