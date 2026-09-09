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
      className="rounded-lg border border-pending/40 bg-pending-tint p-4"
    >
      <h2
        id="setup-checklist-heading"
        className="text-sm font-semibold text-pending"
      >
        {report.hasBlockingIssues ? t('blocking-title') : t('title')}
      </h2>
      <p className="mt-1 text-sm text-pending">
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
      <h3 className="text-xs font-semibold uppercase tracking-wide text-pending">
        {heading}
      </h3>
      <ul className="mt-2 space-y-3">
        {findings.map((finding) => (
          <li key={finding.id} data-testid={`setup-finding-${finding.id}`}>
            <p className="font-mono text-sm text-pending">
              {finding.vars.join(', ')}
            </p>
            <p className="text-sm text-pending">
              {/* Message ids come from a closed set defined next to the checks,
                  so this indirection cannot reach an arbitrary key. */}
              {t(
                `findings.${finding.id}` as never,
                finding.values as never,
              )}
            </p>
            <p className="mt-1 text-xs text-pending">
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
