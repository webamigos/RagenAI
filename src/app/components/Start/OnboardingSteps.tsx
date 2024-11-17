import { useEffect } from 'react';
import { useOnboardingContext } from '@/app/hooks/useOnboardingContext';
import { useTranslations } from 'next-intl';

import { JoyrideStep } from '@/context/OnboardingContext';

export const OnboardingSteps = () => {
  const { addSteps } = useOnboardingContext();
  const t = useTranslations('onboarding');

  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;

  const steps: JoyrideStep[] = [
    {
      target: '.start-button',
      content: t('first-step'),
      route: '/',
      disableBeacon: true,
    },
    {
      target: isMobile
        ? '.create-organization-tab-mobile'
        : '.create-organization-tab',
      content: t('second-step'),
      route: '/my-profile',
    },
    {
      target: '.organization-name',
      content: t('third-step'),
      route: '/my-profile/create-organization',
    },
    {
      target: '.create-organization-button',
      content: t('fourth-step'),
      route: '/my-profile/create-organization',
    },
    {
      target: isMobile
        ? '.assistant-management-mobile'
        : '.assistant-management',
      content: t('fifth-step'),
      route: '/my-profile/prompt-management',
    },
    {
      target: '.setApiKeyInput',
      content: t('sixth-step'),
      route: '/my-profile/prompt-management',
    },
    {
      target: isMobile ? '.manage-knowledge-mobile' : '.manage-knowledge',
      content: t('seventh-step'),
      route: '/manage-knowledge',
    },
    {
      target: '.crete-document',
      content: t('ninth-step'),
      route: '/manage-knowledge',
    },
    {
      target: '.add-file',
      content: t('eighth-step'),
      route: '/manage-knowledge',
    },
  ];

  useEffect(() => {
    addSteps(steps);
  }, []);

  return null;
};
