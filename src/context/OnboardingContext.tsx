'use client';

import React, { createContext, useState } from 'react';
import Joyride, { CallBackProps, EVENTS, STATUS, Step } from 'react-joyride';
import { useRouter } from 'next/navigation';

interface JoyrideContextProps {
  steps: Step[];
  addSteps: (newSteps: Step[]) => void;
  runJoyride: () => void;
  stopJoyride: () => void;
  resetJoyride: () => void;
}

export const JoyrideContext = createContext<JoyrideContextProps | undefined>(
  undefined
);

export const JoyrideProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [steps, setSteps] = useState<Step[]>([]);
  const [run, setRun] = useState(false);
  const router = useRouter();

  const addSteps = (newSteps: Step[]) =>
    setSteps((prev) => [...prev, ...newSteps]);

  const runJoyride = () => setRun(true);
  const stopJoyride = () => setRun(false);
  const resetJoyride = () => {
    setSteps([]);
    setRun(false);
  };

  const handleJoyrideCallback = (data: CallBackProps) => {
    const { status, type, index } = data;

    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      stopJoyride();
    }
    //test
    if (type === EVENTS.STEP_AFTER) {
      if (index === 0) {
        router.push('/my-profile/create-organization');
      }
    }
  };

  return (
    <JoyrideContext.Provider
      value={{ steps, addSteps, runJoyride, stopJoyride, resetJoyride }}
    >
      {children}
      <Joyride
        steps={steps}
        run={run}
        continuous
        showProgress
        showSkipButton
        callback={handleJoyrideCallback}
      />
    </JoyrideContext.Provider>
  );
};
