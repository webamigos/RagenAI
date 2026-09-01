'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@ragenai/common-ui/Button';
import { SupportCategory } from './types';
import { BugForm } from './forms/BugForm';
import { QuestionForm } from './forms/QuestionForm';
import { SuggestionForm } from './forms/SuggestionForm';

type Props = {
  category: SupportCategory;
  isSubmitting: boolean;
  onBack: () => void;
};

export const FormStep = ({ category, isSubmitting, onBack }: Props) => {
  const t = useTranslations('support-page.wizard');

  return (
    <div className="space-y-4">
      {category === SupportCategory.Bug && <BugForm />}
      {category === SupportCategory.Question && <QuestionForm />}
      {category === SupportCategory.Suggestion && <SuggestionForm />}

      <div className="flex gap-3 pt-2">
        <Button
          type="button"
          plain
          onClick={onBack}
          disabled={isSubmitting}
          className="flex-1"
        >
          {t('back')}
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting}
          className="flex-1 flex justify-center"
        >
          {isSubmitting ? t('submitting') : t('submit')}
        </Button>
      </div>
    </div>
  );
};
