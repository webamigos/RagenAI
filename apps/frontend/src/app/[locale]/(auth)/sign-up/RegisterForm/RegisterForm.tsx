'use client';

import { useState } from 'react';

import { AccountDetailsForm } from './AccountDetailsForm';
import { VerificationForm } from './VerificationForm';

export const RegisterForm = () => {
  const [step, setStep] = useState(0);

  return (
    <div>
      {step === 0 ? (
        <AccountDetailsForm onSuccess={() => setStep(1)} />
      ) : (
        <VerificationForm />
      )}
    </div>
  );
};
