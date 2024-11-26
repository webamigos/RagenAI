'use client';

import React, { createContext, useState } from 'react';
import Joyride, {
  ACTIONS,
  STATUS,
  EVENTS,
  Step,
  CallBackProps,
} from 'react-joyride';
import { useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { SpinnerSVG } from '@ragenai/common-ui/icons';
import { saveUserMetadata } from '@/app/actions';
import { useTranslations } from 'next-intl';
import { useSidebar } from '@/app/hooks/useSidebar';
export interface JoyrideStep extends Step {
  target: string;
  route?: string;
}

interface JoyrideContextProps {
  run: boolean;
  steps: JoyrideStep[];
  addSteps: (newSteps: JoyrideStep[]) => void;
  runJoyride: () => void;
  stopJoyride: () => void;
  showOnboarding?: boolean;
}

export const JoyrideContext = createContext<JoyrideContextProps | undefined>(
  undefined
);

export const JoyrideProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [steps, setSteps] = useState<JoyrideStep[]>([]);
  const [run, setRun] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { user, isSignedIn } = useUser();
  const t = useTranslations('joyride');
  const { openSidebar, closeSidebar } = useSidebar();

  const onboardingComplete = user?.publicMetadata.onboardingComplete as boolean;
  const userBelongsToOrganization =
    user?.organizationMemberships[0]?.id !== undefined;
  const showOnboarding =
    !userBelongsToOrganization && !onboardingComplete && isSignedIn;

  const addSteps = (newSteps: JoyrideStep[]) => setSteps(newSteps);

  const runJoyride = () => {
    setRun(true);
    setStepIndex(0);
  };

  const stopJoyride = () => {
    setRun(false);
    setStepIndex(0);
  };

  const handleJoyrideCallback = async (data: CallBackProps) => {
    const { action, index, status, type } = data;

    if (!user) return;

    if (action === ACTIONS.CLOSE || status === STATUS.SKIPPED) {
      await saveUserMetadata(user.id, true);
      await user.reload();
      stopJoyride();
      return;
    }

    if (type === EVENTS.STEP_AFTER) {
      if (index === 0) openSidebar(); // Moving to step 1
      else if (index === 1) closeSidebar(); // Moving to step 2
      else if (index === 3) openSidebar(); // Moving to step 4
      else if (index === 4) closeSidebar(); // Moving to step 5
      else if (index === 5) openSidebar(); // Moving to step 6
      else if (index === 6) closeSidebar(); // Moving to step 7
    }
    if (action === ACTIONS.PREV && type === EVENTS.STEP_AFTER) {
      if (index === 2) openSidebar(); // Moving back to step 1
      else if (index === 7) openSidebar(); // Moving back to step 6
    }

    if (type === EVENTS.STEP_AFTER || type === EVENTS.ERROR) {
      const nextIndex = index + (action === ACTIONS.PREV ? -1 : 1);
      const nextStep = steps[nextIndex];

      if (nextStep && nextStep.route) {
        setIsLoading(true);

        router.push(nextStep.route);

        let attempts = 0;
        const interval = setInterval(() => {
          const targetExists = document.querySelector(nextStep.target);
          attempts += 1;

          if (targetExists) {
            const bounding = targetExists.getBoundingClientRect();
            const isVisible =
              bounding.top >= 0 && bounding.bottom <= window.innerHeight;

            if (isVisible) {
              setStepIndex(nextIndex);
              setIsLoading(false);
              clearInterval(interval);
            }
          }

          if (attempts >= 10) {
            setIsLoading(false);
            clearInterval(interval);
          }
        }, 500);
      } else {
        setStepIndex(nextIndex);
      }
    } else if (status === STATUS.FINISHED) {
      await saveUserMetadata(user.id, true);
      await user.reload();
      stopJoyride();
    }
  };

  return (
    <JoyrideContext.Provider
      value={{
        run,
        steps,
        addSteps,
        runJoyride,
        stopJoyride,
        showOnboarding,
      }}
    >
      {children}
      {isLoading && (
        <div className="fixed inset-0 flex items-center justify-center bg-gray-500 bg-opacity-50 z-50">
          <SpinnerSVG />
        </div>
      )}
      <Joyride
        steps={steps}
        stepIndex={stepIndex}
        run={run}
        continuous
        showProgress
        showSkipButton
        disableOverlayClose
        disableCloseOnEsc
        disableScrolling
        callback={handleJoyrideCallback}
        locale={{
          skip: t('skip'),
          next: t('next'),
          last: t('finish'),
          back: t('back'),
        }}
        styles={{
          options: {
            zIndex: 1000,
            primaryColor: '#4A90E2',
            textColor: '#333',
            backgroundColor: '#fff',
          },
          tooltipContainer: {
            borderRadius: '20px',
          },
          tooltip: {
            borderRadius: '20px',
          },
          tooltipTitle: {
            fontSize: '18px',
            fontWeight: 'bold',
            color: '#333',
          },
          tooltipContent: {
            fontSize: '16px',
            color: '#555',
          },
          buttonClose: {
            display: 'none',
          },
          buttonNext: {
            backgroundColor: '#4A90E2',
            color: '#fff',
            borderRadius: '4px',
            padding: '8px 16px',
          },
          buttonSkip: {
            color: '#4A90E2',
            fontSize: '14px',
          },
        }}
      />
    </JoyrideContext.Provider>
  );
};
