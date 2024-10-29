'use client';

import axios from 'axios';

import { clientLogger } from '@/app/lib/utils/clientLogger';
import { Button } from '@salesyy/common-ui';

export const Avatar = () => {
  const handleClick = async () => {
    const avatarResponse = await axios.post('/api/avatar');
    clientLogger.info('Avatar response: %o', avatarResponse);
  };

  return (
    <div className="mt-auto px-4 sm:px-4 lg:px-22 pb-8">
      Video here <Button label="Start session" onClick={handleClick} />
    </div>
  );
};
