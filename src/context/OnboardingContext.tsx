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
import { SpinnerSVG } from '@salesyy/common-ui/icons';

export interface JoyrideStep extends Step {
  target: string;
  route?: string;
}

interface JoyrideContextProps {
  steps: JoyrideStep[];
  addSteps: (newSteps: JoyrideStep[]) => void;
  runJoyride: () => void;
  stopJoyride: () => void;
  onboardingComplete: boolean;
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

  const handleJoyrideCallback = (data: CallBackProps) => {
    const { action, index, status, type } = data;

    if (action === ACTIONS.CLOSE || status === STATUS.SKIPPED) {
      stopJoyride();
      return;
    }

    if (type === EVENTS.STEP_AFTER || type === EVENTS.ERROR) {
      const nextIndex = index + (action === ACTIONS.PREV ? -1 : 1);
      const nextStep = steps[nextIndex];

      if (nextStep && nextStep.route) {
        setIsLoading(true);
        router.push(nextStep.route);
        const interval = setInterval(() => {
          const targetExists = document.querySelector(nextStep.target);
          if (targetExists) {
            setStepIndex(nextIndex);
            setIsLoading(false);
            clearInterval(interval);
          }
        }, 100);
      } else {
        setStepIndex(nextIndex);
      }
    } else if (status === STATUS.FINISHED) {
      stopJoyride();
    }
  };

  return (
    <JoyrideContext.Provider
      value={{
        steps,
        addSteps,
        runJoyride,
        stopJoyride,
        onboardingComplete,
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
        callback={handleJoyrideCallback}
        locale={{
          skip: 'Skip',
          last: 'Finish',
        }}
        styles={{
          options: {
            zIndex: 1000,
          },
        }}
      />
    </JoyrideContext.Provider>
  );
};
