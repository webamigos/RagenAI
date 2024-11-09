'use client';

import React, { createContext, useState } from 'react';
import Joyride, {
  ACTIONS,
  EVENTS,
  STATUS,
  Step,
  CallBackProps,
} from 'react-joyride';
import { useRouter } from 'next/navigation';

export interface JoyrideStep extends Step {
  target: string;
  route?: string;
}

interface JoyrideContextProps {
  steps: JoyrideStep[];
  addSteps: (newSteps: JoyrideStep[]) => void;
  runJoyride: () => void;
  stopJoyride: () => void;
}

export const JoyrideContext = createContext<JoyrideContextProps | undefined>(
  undefined
);

export const JoyrideProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [steps, setSteps] = useState<JoyrideStep[]>([]);
  const [run, setRun] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const router = useRouter();

  const addSteps = (newSteps: JoyrideStep[]) => setSteps(newSteps);

  const runJoyride = () => {
    setRun(true);
    setStepIndex(0);
  };

  const stopJoyride = () => setRun(false);

  const handleJoyrideCallback = (data: CallBackProps) => {
    const { action, index, status, type } = data;

    if (type === 'step:after' || type === 'error:target_not_found') {
      const nextIndex = index + (action === ACTIONS.PREV ? -1 : 1);
      const nextStep = steps[nextIndex];

      if (nextStep && nextStep.route) {
        router.push(nextStep.route);
        const interval = setInterval(() => {
          const targetExists = document.querySelector(nextStep.target);
          if (targetExists) {
            setStepIndex(nextIndex);
            clearInterval(interval);
          }
        }, 100);
      } else {
        setStepIndex(nextIndex);
      }
    } else if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      setRun(false);
    }
  };

  return (
    <JoyrideContext.Provider
      value={{ steps, addSteps, runJoyride, stopJoyride }}
    >
      {children}
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
      />
    </JoyrideContext.Provider>
  );
};
