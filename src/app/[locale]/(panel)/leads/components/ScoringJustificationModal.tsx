'use client';

import { useTranslations } from 'next-intl';
import { XMarkIcon } from '@heroicons/react/24/outline';
import {
  Dialog,
  DialogTitle,
  DialogBody,
  DialogActions,
} from '@ragenai/tui/dialog';
import { Button } from '@ragenai/tui/button';
import { clsx } from 'clsx';

type Props = {
  justification: string | null;
  onClose: () => void;
};

type ParsedCriterion = {
  label: string;
  points: number;
  maxPoints: number;
  justification: string;
};

type ParsedJustification = {
  criteria: ParsedCriterion[];
  summary: {
    rawScore: number;
    maxRaw: number;
    finalScore: number;
  } | null;
  isDisqualification: boolean;
  disqualificationReason: string;
};

function parseJustification(text: string): ParsedJustification {
  if (text.trim().startsWith('DYSKWALIFIKACJA:')) {
    return {
      criteria: [],
      summary: null,
      isDisqualification: true,
      disqualificationReason: text.replace('DYSKWALIFIKACJA:', '').trim(),
    };
  }

  const lines = text.split('\n').filter((l) => l.trim());
  const criteria: ParsedCriterion[] = [];
  let summary: ParsedJustification['summary'] = null;

  for (const line of lines) {
    // Skip summary lines — we recompute from parsed criteria below
    if (/Łączny wynik:/.test(line)) {
      continue;
    }

    // [Label: 8/10 pkt (×1.5 = 12/15)] — legacy format with weight suffix
    const withWeightMatch = line.match(
      /^\[(.+?):\s*(\d+)\/(\d+)\s*pkt\s*\(×[\d.]+\s*=\s*[\d.]+\/[\d.]+\)\]\s*(.*)/,
    );
    if (withWeightMatch) {
      criteria.push({
        label: withWeightMatch[1],
        points: parseInt(withWeightMatch[2], 10),
        maxPoints: parseInt(withWeightMatch[3], 10),
        justification: withWeightMatch[4].trim(),
      });
      continue;
    }

    // [Label: 8/10 pkt] — current format
    const simpleMatch = line.match(/^\[(.+?):\s*(\d+)\/(\d+)\s*pkt\]\s*(.*)/);
    if (simpleMatch) {
      criteria.push({
        label: simpleMatch[1],
        points: parseInt(simpleMatch[2], 10),
        maxPoints: parseInt(simpleMatch[3], 10),
        justification: simpleMatch[4].trim(),
      });
    }
  }

  if (criteria.length === 0) {
    return {
      criteria: [],
      summary: null,
      isDisqualification: false,
      disqualificationReason: '',
    };
  }

  // Always recompute summary from parsed criteria — ignore stored summary text
  const totalPoints = criteria.reduce((s, c) => s + c.points, 0);
  const totalMax = criteria.reduce((s, c) => s + c.maxPoints, 0);
  summary = {
    rawScore: totalPoints,
    maxRaw: totalMax,
    finalScore: totalMax > 0 ? Math.round((totalPoints / totalMax) * 100) : 0,
  };

  return {
    criteria,
    summary,
    isDisqualification: false,
    disqualificationReason: '',
  };
}

function ScoreBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  let barColor: string;
  if (pct >= 70) {
    barColor = 'bg-emerald-500 dark:bg-emerald-400';
  } else if (pct >= 40) {
    barColor = 'bg-amber-500 dark:bg-amber-400';
  } else {
    barColor = 'bg-red-500 dark:bg-red-400';
  }
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
      <div
        className={clsx('h-full rounded-full transition-all', barColor)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function ScoreBadge({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  let colorClass: string;
  if (pct >= 70) {
    colorClass =
      'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 ring-emerald-200 dark:ring-emerald-800';
  } else if (pct >= 40) {
    colorClass =
      'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 ring-amber-200 dark:ring-amber-800';
  } else {
    colorClass =
      'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 ring-red-200 dark:ring-red-800';
  }
  return (
    <span
      className={clsx(
        'inline-flex items-baseline gap-0.5 rounded-md px-2 py-0.5 text-xs font-semibold ring-1',
        colorClass,
      )}
    >
      <span>{value}</span>
      <span className="font-normal opacity-60">/{max}</span>
    </span>
  );
}

export function ScoringJustificationModal({ justification, onClose }: Props) {
  const t = useTranslations('leads-page');

  const parsed = justification ? parseJustification(justification) : null;
  const hasParsedContent =
    parsed &&
    !parsed.isDisqualification &&
    (parsed.criteria.length > 0 || parsed.summary);

  return (
    <Dialog open={justification !== null} onClose={onClose} size="2xl">
      <button
        type="button"
        onClick={onClose}
        aria-label={t('close')}
        className="absolute right-3 top-3 inline-flex size-7 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
      >
        <XMarkIcon className="size-4" />
      </button>
      <DialogTitle>{t('scoring-justification-title')}</DialogTitle>
      <DialogBody>
        {!parsed && null}

        {parsed?.isDisqualification && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/40">
            <p className="text-xs font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">
              {t('scoring-disqualification-label')}
            </p>
            <p className="mt-1 text-sm text-red-800 dark:text-red-300">
              {parsed.disqualificationReason}
            </p>
          </div>
        )}

        {hasParsedContent && (
          <div className="space-y-3">
            {parsed.criteria.map((c, i) => (
              <div
                // Index suffix guards against duplicate labels — the
                // rubric LLM has been known to emit two criteria sharing
                // a label, which would collide on key={c.label} alone.
                key={`${c.label}-${i}`}
                className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 leading-tight">
                    {c.label}
                  </p>
                  <div className="flex shrink-0 items-center gap-2">
                    <ScoreBadge value={c.points} max={c.maxPoints} />
                  </div>
                </div>
                <div className="mt-2">
                  <ScoreBar value={c.points} max={c.maxPoints} />
                </div>
                {c.justification && (
                  <p className="mt-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                    {c.justification}
                  </p>
                )}
              </div>
            ))}

            {parsed.summary && (
              <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2.5 dark:border-violet-800 dark:bg-violet-950/40">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-400">
                    {t('scoring-total-label')}
                  </p>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-violet-600 dark:text-violet-400">
                      {parsed.summary.rawScore}/{parsed.summary.maxRaw}{' '}
                      {t('scoring-points-label')}
                    </span>
                    <span className="rounded-md bg-violet-600 px-2.5 py-0.5 text-sm font-bold text-white dark:bg-violet-500">
                      {parsed.summary.finalScore}
                      <span className="ml-0.5 text-xs font-normal opacity-70">
                        /100
                      </span>
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {parsed && !parsed.isDisqualification && !hasParsedContent && (
          <pre className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
            {justification}
          </pre>
        )}
      </DialogBody>
      <DialogActions>
        <Button onClick={onClose}>{t('close')}</Button>
      </DialogActions>
    </Dialog>
  );
}
