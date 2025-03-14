'use client';

import { CheckConfiguration } from './CheckConfiguration';
import { Misconfigured } from './Misconfigured';

const REFETCH_INTERVAL = 1000;
const SETUP_COMPLETE_REDIRECT_PATH = '/';

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
