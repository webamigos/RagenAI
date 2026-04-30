'use client';

import { useState } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';

import { statusToast } from '@/app/lib/utils/toast';
import { logger } from '@/app/lib/utils/logger';
import { sendSupportRequest } from '@/app/lib/services/api';

import {
  SupportCategory,
  bugSchema,
  questionSchema,
  suggestionSchema,
  type BugFormData,
  type QuestionFormData,
  type SuggestionFormData,
} from './types';
import { CategoryStep } from './CategoryStep';
import { FormStep } from './FormStep';
import { SuccessStep } from './SuccessStep';

type WizardStep = 'category' | 'form' | 'success';

type Props = {
  context: 'page' | 'modal';
  onClose?: () => void;
};

type FormData = BugFormData | QuestionFormData | SuggestionFormData;

function getSchema(category: SupportCategory) {
  switch (category) {
    case SupportCategory.Bug:
      return bugSchema;
    case SupportCategory.Question:
      return questionSchema;
    case SupportCategory.Suggestion:
      return suggestionSchema;
  }
}

export const SupportWizard = ({ context, onClose }: Props) => {
  const t = useTranslations('support-page');
  const [step, setStep] = useState<WizardStep>('category');
  const [category, setCategory] = useState<SupportCategory | null>(null);
  const { successToast, errorToast } = statusToast();

  const methods = useForm<FormData>({
    resolver: category ? zodResolver(getSchema(category)) : undefined,
  });

  const handleCategorySelect = (selected: SupportCategory) => {
    setCategory(selected);
    methods.reset();
    setStep('form');
  };

  const handleBack = () => {
    setStep('category');
  };

  const handleReset = () => {
    setCategory(null);
    methods.reset();
    setStep('category');
  };

  const onSubmit = async (data: FormData) => {
    if (!category) {
      return;
    }
    try {
      let title = '';
      let message = '';
      let files: File[] | undefined;

      if (category === SupportCategory.Bug) {
        const d = data as BugFormData;
        title = d.title;
        message = `${d.description}\n\nKroki do reprodukcji:\n${d.steps}`;
        files = d.screenshot as File[] | undefined;
      } else if (category === SupportCategory.Question) {
        const d = data as QuestionFormData;
        title = d.title;
        message = d.message;
      } else {
        const d = data as SuggestionFormData;
        title = d.title;
        message = d.description;
      }

      await sendSupportRequest({ title, message, type: category }, files);
      successToast({ message: t('send-success') });
      setStep('success');
    } catch (error) {
      logger.error({ err: error }, 'Failed to send support request');
      errorToast({ message: t('send-error') });
    }
  };

  if (step === 'success') {
    return (
      <SuccessStep context={context} onReset={handleReset} onClose={onClose} />
    );
  }

  if (step === 'category' || !category) {
    return <CategoryStep onSelect={handleCategorySelect} />;
  }

  return (
    <FormProvider {...methods}>
      <form onSubmit={methods.handleSubmit(onSubmit)}>
        <FormStep
          category={category}
          isSubmitting={methods.formState.isSubmitting}
          onBack={handleBack}
        />
      </form>
    </FormProvider>
  );
};
