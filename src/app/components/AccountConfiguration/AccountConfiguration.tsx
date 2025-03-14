'use client';

import { CheckConfiguration } from './CheckConfiguration';
import { Misconfigured } from './Misconfigured';

type Props = Readonly<{
  misconfigurationDetected?: boolean;
}>;

export const AccountConfiguration = ({
  misconfigurationDetected = false,
}: Props) => {
  if (misconfigurationDetected) {
    return <Misconfigured />;
  }

  return <CheckConfiguration />;
};
