'use client';

import { useState } from 'react';
import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  Dialog,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogActions,
} from '@ragenai/tui/dialog';
import { Button } from '@ragenai/tui/button';
import { enrichLead } from '@/app/actions/leads';
import type { LeadDto } from '@/features/leads/contracts/lead-list.types';

type Props = {
  lead: LeadDto | null;
  onClose: () => void;
};

function normalizeNip(raw: string): string {
  return raw.replace(/[\s-]/g, '');
}

function isValidNip(nip: string): boolean {
  return /^\d{10}$/.test(nip);
}

function sanitizeErrorForDisplay(
  error: string,
  t: (key: string) => string,
): string {
  if (error.includes('budget exceeded')) {
    return t('manual-enrich-error-budget-exceeded');
  }
  if (error.includes('unavailable') || error.startsWith('upstream_')) {
    return t('manual-enrich-error-unavailable');
  }
  if (error === 'timeout' || error === 'network_error') {
    return t('manual-enrich-error-unavailable');
  }
  return t('manual-enrich-error-unknown');
}

function extractCompanyName(data: Record<string, unknown>): string {
  const keys = ['company', 'firma', 'nazwa', 'name'];
  for (const key of keys) {
    const val = data[key];
    if (typeof val === 'string' && val.trim()) {
      return val.trim();
    }
  }
  return '';
}

export function ManualNipModal({ lead, onClose }: Props) {
  const t = useTranslations('leads-page');
  const router = useRouter();
  const [nipRaw, setNipRaw] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const nip = normalizeNip(nipRaw);
  const nipInvalid = nipRaw.length > 0 && !isValidNip(nip);
  const canSubmit = isValidNip(nip) && !isLoading;

  const handleSubmit = async () => {
    if (!lead || !canSubmit) {
      return;
    }
    setIsLoading(true);
    setServerError(null);
    try {
      const result = await enrichLead({
        leadPublicId: lead.publicId,
        lookup: { nip },
      });
      if (result.status === 'enriched') {
        toast.success(t('enrich-success'));
        onClose();
        router.refresh();
      } else if (result.status === 'failed') {
        setServerError(result.error ?? t('enrich-failed'));
      }
    } catch (error) {
      setServerError(
        error instanceof Error ? error.message : t('enrich-failed'),
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      setNipRaw('');
      setServerError(null);
      onClose();
    }
  };

  const companyName = lead ? extractCompanyName(lead.data) : '';

  return (
    <Dialog open={lead !== null} onClose={handleClose} size="sm">
      <DialogTitle>{t('manual-enrich-title')}</DialogTitle>
      <DialogDescription />
      <DialogBody>
        <div className="space-y-4">
          {companyName && (
            <div>
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                {t('manual-enrich-company-label')}
              </p>
              <p className="mt-0.5 text-sm text-zinc-700 dark:text-zinc-300">
                {companyName}
              </p>
            </div>
          )}

          {lead?.enrichmentError && (
            <div>
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                {t('manual-enrich-error-label')}
              </p>
              <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
                {sanitizeErrorForDisplay(lead.enrichmentError, t)}
              </p>
            </div>
          )}

          <div>
            <label
              htmlFor="manual-nip-input"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              {t('manual-enrich-nip-label')}
            </label>
            <input
              id="manual-nip-input"
              type="text"
              value={nipRaw}
              onChange={(e) => {
                setNipRaw(e.target.value);
                setServerError(null);
              }}
              disabled={isLoading}
              placeholder={t('manual-enrich-nip-placeholder')}
              className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder-zinc-500"
            />
            {nipInvalid && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                {t('manual-enrich-nip-invalid')}
              </p>
            )}
            {serverError && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                {serverError}
              </p>
            )}
          </div>
        </div>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={handleClose} disabled={isLoading}>
          {t('cancel')}
        </Button>
        <Button onClick={handleSubmit} disabled={!canSubmit}>
          {t('manual-enrich-submit')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
