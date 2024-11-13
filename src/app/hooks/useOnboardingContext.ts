import { useContext } from 'react';

import { JoyrideContext } from '@/context/OnboardingContext';

export const useOnboardingContext = () => {
  const context = useContext(JoyrideContext);
  if (!context) {
    throw new Error('useOnboarding must be used within a onboarding provider');
  }
  return context;
};
