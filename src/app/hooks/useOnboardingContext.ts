import { useContext } from 'react';

import { JoyrideContext } from '@/context/OnboardingContext';

export const useOnboardingContext = () => {
  const context = useContext(JoyrideContext);
  if (!context) {
    throw new Error('useSidebar must be used within a SidebarProvider');
  }
  return context;
};
