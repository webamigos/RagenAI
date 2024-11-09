import { useEffect } from 'react';
import { useOnboardingContext } from '@/app/hooks/useOnboardingContext';

import { JoyrideStep } from '@/context/OnboardingContext';

export const OnboardingSteps = () => {
  const { addSteps } = useOnboardingContext();

  const steps: JoyrideStep[] = [
    {
      target: '.start-button',
      content: 'To jest pierwszy krok!',
      route: '/',
    },
    {
      target: '.create-organization-tab',
      content: 'To jest drugi krok!',
      route: '/my-profile',
    },
    {
      target: '.create-organization-button',
      content: 'To jest drugi krok!',
      route: '/my-profile/create-organization',
    },
    {
      target: '.setApiKeyInput',
      content: 'To jest drugi krok!',
      route: '/my-profile/prompt-management',
    },
  ];

  useEffect(() => {
    addSteps(steps);
  }, []);

  return null;
};
