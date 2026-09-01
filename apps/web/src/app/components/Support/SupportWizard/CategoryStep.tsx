'use client';

import { useTranslations } from 'next-intl';
import {
  BugAntIcon,
  QuestionMarkCircleIcon,
  LightBulbIcon,
} from '@heroicons/react/24/outline';
import { SupportCategory } from './types';

type Props = {
  onSelect: (category: SupportCategory) => void;
};

const CATEGORIES = [
  { key: SupportCategory.Bug, Icon: BugAntIcon },
  { key: SupportCategory.Question, Icon: QuestionMarkCircleIcon },
  { key: SupportCategory.Suggestion, Icon: LightBulbIcon },
] as const;

export const CategoryStep = ({ onSelect }: Props) => {
  const t = useTranslations('support-page.wizard');

  return (
    <div>
      <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-4">
        {t('category-title')}
      </p>
      <div className="grid grid-cols-1 gap-3">
        {CATEGORIES.map(({ key, Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => onSelect(key)}
            className="flex items-center gap-4 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4 text-left hover:border-zinc-400 dark:hover:border-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
          >
            <Icon className="size-6 shrink-0 text-zinc-500 dark:text-zinc-400" />
            <div>
              <p className="text-sm font-medium text-zinc-900 dark:text-white">
                {t(`categories.${key}.label`)}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {t(`categories.${key}.description`)}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
