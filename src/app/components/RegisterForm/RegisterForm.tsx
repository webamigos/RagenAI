import { useState } from 'react';

import { AccountDetailsForm } from './AccountDetailsForm';
import { VerificationForm } from './VerificationForm';
import { Card } from '@salesyy/common-ui';

export const RegisterForm = () => {
  const [step, setStep] = useState(0);

  return (
    <Card>
      {step === 0 ? (
        <AccountDetailsForm onSuccess={() => setStep(1)} />
      ) : (
        <VerificationForm />
      )}
    </Card>
  );
};
