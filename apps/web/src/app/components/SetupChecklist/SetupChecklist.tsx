import { useTranslations } from 'next-intl';

import type { SetupReport } from '@/features/setup/contracts/types';

type SetupChecklistProps = {
  report: SetupReport;
};

/**
 * The "what still needs configuring" panel shown on the first-run screens.
 *
 * Required findings come first: an operator staring at a broken install should
 * not have to read past three nice-to-haves to find the reason nothing works.
 */
export const SetupChecklist = ({ report }: SetupChecklistProps) => {
  const t = useTranslations('setup');

  if (report.findings.length === 0) {
    return null;
  }

  const required = report.findings.filter((f) => f.severity === 'required');
  const recommended = report.findings.filter(
    (f) => f.severity === 'recommended',
  );

  return (
    <section
      aria-labelledby="setup-checklist-heading"
      className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-700/60 dark:bg-amber-950/30"
    >
      <h2
        id="setup-checklist-heading"
        className="text-sm font-semibold text-amber-900 dark:text-amber-200"
      >
        {report.hasBlockingIssues ? t('blocking-title') : t('title')}
      </h2>
      <p className="mt-1 text-sm text-amber-800 dark:text-amber-300/90">
        {t('intro')}
      </p>

      {required.length > 0 && (
        <FindingGroup
          heading={t('required-heading')}
          findings={required}
          tone="required"
        />
      )}
      {recommended.length > 0 && (
        <FindingGroup
          heading={t('recommended-heading')}
          findings={recommended}
          tone="recommended"
        />
      )}
    </section>
  );
};

type FindingGroupProps = {
  heading: string;
  findings: SetupReport['findings'];
  tone: 'required' | 'recommended';
};

const FindingGroup = ({ heading, findings, tone }: FindingGroupProps) => {
  const t = useTranslations('setup');

  return (
    <div className="mt-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-900/70 dark:text-amber-200/70">
        {heading}
      </h3>
      <ul className="mt-2 space-y-3">
        {findings.map((finding) => (
          <li key={finding.id} data-testid={`setup-finding-${finding.id}`}>
            <p className="font-mono text-sm text-amber-950 dark:text-amber-100">
              {finding.vars.join(', ')}
            </p>
            <p className="text-sm text-amber-800 dark:text-amber-300/90">
              {/* Message ids come from a closed set defined next to the checks,
                  so this indirection cannot reach an arbitrary key. */}
              {t(
                `findings.${finding.id}` as never,
                finding.values as never,
              )}
            </p>
            <p className="mt-1 text-xs text-amber-900/80 dark:text-amber-300/70">
              <span className="font-medium">
                {tone === 'required' ? t('example') : t('default-hint')}
              </span>{' '}
              <code className="break-all">{finding.example}</code>
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
};
