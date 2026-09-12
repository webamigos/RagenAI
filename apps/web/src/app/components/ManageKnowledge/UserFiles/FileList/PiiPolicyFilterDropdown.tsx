'use client';

import { useTranslations } from 'next-intl';
import { PiiPolicy } from '@/generated/prisma/browser';

import { FilterChip, type FilterOption } from './FilterChip';

/**
 * The three policies, in the order the policy select in the table lists them —
 * least masking first — so the filter and the column read the same way round.
 *
 * Labels come from `pii-policy.badge-*`, the same strings the column's own
 * badge uses. Panel rule 22 says PII copy matches the policy names exactly,
 * and a filter that named them differently from the cells it filters would be
 * the fastest way to break that.
 */
const POLICY_OPTIONS: readonly { value: PiiPolicy; labelKey: string }[] = [
  { value: PiiPolicy.NONE, labelKey: 'badge-none' },
  { value: PiiPolicy.TOXIC_ONLY, labelKey: 'badge-toxic-only' },
  { value: PiiPolicy.STRICT, labelKey: 'badge-strict' },
];

type Props = {
  selected: PiiPolicy[];
  onChange: (policies: PiiPolicy[]) => void;
};

export function PiiPolicyFilterDropdown({ selected, onChange }: Props) {
  const t = useTranslations('files-table');
  const tPii = useTranslations('pii-policy');

  const options: readonly FilterOption<PiiPolicy>[] = POLICY_OPTIONS.map(
    ({ value, labelKey }) => ({
      value,
      label: tPii(labelKey as Parameters<typeof tPii>[0]),
    }),
  );

  return (
    <FilterChip
      name={t('filter-pii-policy')}
      allLabel={t('filter-pii-policy-all')}
      options={options}
      selected={selected}
      onChange={onChange}
      menuWidthClassName="w-52"
      data-testid="filter-pii-policy"
    />
  );
}
