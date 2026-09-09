'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@ragenai/common-ui/Button';
import { Input } from '@ragenai/common-ui/Input';
import { statusToast } from '@/app/lib/utils/toast';
import { getTeamSettings, updateTeamSettings } from '@/app/actions/teams';
import type { TeamSettings } from '@/features/teams/contracts/team.types';
import type { AvailableModel } from '@/app/components/config';

type Props = {
  teamId: string;
  availableModels: AvailableModel[];
};

const BUDGET_DURATIONS = ['7d', '30d', '90d', '1y'] as const;
type BudgetDuration = (typeof BUDGET_DURATIONS)[number];

function centsToDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

function dollarsToCents(dollars: string): number {
  const parsed = Number.parseFloat(dollars);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.round(parsed * 100);
}

export function TeamSettingsSection({ teamId, availableModels }: Props) {
  const t = useTranslations('teams-page');
  const { successToast, errorToast } = statusToast();
  const [settings, setSettings] = useState<TeamSettings | null>(null);
  const [budgetDollars, setBudgetDollars] = useState('');
  const [budgetDuration, setBudgetDuration] = useState<BudgetDuration>('30d');
  const [rpmLimit, setRpmLimit] = useState('');
  const [tpmLimit, setTpmLimit] = useState('');
  const [allowedModels, setAllowedModels] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    getTeamSettings(teamId)
      .then((result) => {
        if (cancelled || !result) {
          return;
        }
        setSettings(result);
        setBudgetDollars(centsToDollars(result.budgetUsdCents));
        setBudgetDuration(
          (BUDGET_DURATIONS.find((d) => d === result.budgetDuration) ??
            '30d') as BudgetDuration,
        );
        setRpmLimit(result.rpmLimit != null ? String(result.rpmLimit) : '');
        setTpmLimit(result.tpmLimit != null ? String(result.tpmLimit) : '');
        setAllowedModels(result.allowedModels);
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [teamId]);

  const toggleModel = (modelValue: string) => {
    setAllowedModels((prev) =>
      prev.includes(modelValue)
        ? prev.filter((m) => m !== modelValue)
        : [...prev, modelValue],
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const updated = await updateTeamSettings(teamId, {
        budgetUsdCents: dollarsToCents(budgetDollars),
        budgetDuration,
        rpmLimit: rpmLimit.trim() === '' ? null : Number.parseInt(rpmLimit, 10),
        tpmLimit: tpmLimit.trim() === '' ? null : Number.parseInt(tpmLimit, 10),
        allowedModels,
      });
      setSettings(updated);
      successToast({ message: t('settings-saved') });
    } catch {
      errorToast({ message: t('settings-save-error') });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border p-4">
        <div className="h-4 w-32 animate-pulse rounded bg-paper-200 dark:bg-paper-700" />
      </div>
    );
  }

  if (!settings) {
    return null;
  }

  return (
    <form
      onSubmit={handleSave}
      className="space-y-4 rounded-lg border border-border p-4"
    >
      <div>
        <h3 className="text-sm font-semibold text-foreground">
          {t('settings-title')}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {t('settings-description')}
        </p>
        {!settings.litellmProvisioned && (
          <p className="mt-2 rounded border border-pending/40 bg-pending-tint p-2 text-xs text-pending dark:bg-pending/30">
            {t('settings-provision-pending')}
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="team-budget"
            className="mb-1 block text-xs font-medium text-foreground"
          >
            {t('budget-label')} ($)
          </label>
          <Input
            id="team-budget"
            type="number"
            step={0.01}
            min={0}
            value={budgetDollars}
            onChange={(e) => setBudgetDollars(e.target.value)}
            disabled={isSaving}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {t('budget-hint')}
          </p>
        </div>

        <div>
          <label
            htmlFor="team-budget-duration"
            className="mb-1 block text-xs font-medium text-foreground"
          >
            {t('budget-duration-label')}
          </label>
          <select
            id="team-budget-duration"
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
            value={budgetDuration}
            onChange={(e) =>
              setBudgetDuration(e.target.value as BudgetDuration)
            }
            disabled={isSaving}
          >
            {BUDGET_DURATIONS.map((d) => (
              <option key={d} value={d}>
                {t(`budget-duration-${d}`)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="team-rpm"
            className="mb-1 block text-xs font-medium text-foreground"
          >
            {t('rpm-label')}
          </label>
          <Input
            id="team-rpm"
            type="number"
            min="0"
            value={rpmLimit}
            onChange={(e) => setRpmLimit(e.target.value)}
            placeholder={t('rpm-placeholder')}
            disabled={isSaving}
          />
        </div>

        <div>
          <label
            htmlFor="team-tpm"
            className="mb-1 block text-xs font-medium text-foreground"
          >
            {t('tpm-label')}
          </label>
          <Input
            id="team-tpm"
            type="number"
            min="0"
            value={tpmLimit}
            onChange={(e) => setTpmLimit(e.target.value)}
            placeholder={t('tpm-placeholder')}
            disabled={isSaving}
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-foreground">
          {t('allowed-models-label')}
        </label>
        <p className="mb-2 text-xs text-muted-foreground">
          {t('allowed-models-hint')}
        </p>
        {availableModels.length === 0 ? (
          <p className="text-xs text-muted-foreground">—</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {availableModels.map((model) => {
              const selected = allowedModels.includes(model.value);
              return (
                <button
                  key={model.value}
                  type="button"
                  onClick={() => toggleModel(model.value)}
                  disabled={isSaving}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    selected
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card text-foreground hover:border-border/90'
                  }`}
                >
                  {model.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <Button isSubmit disabled={isSaving}>
          {isSaving ? t('saving') : t('save-settings')}
        </Button>
      </div>
    </form>
  );
}
