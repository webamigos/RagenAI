'use client';

import { Button } from '@salesyy/common-ui';
import axios from 'axios';
import { logger } from '../../../lib/utils/logger';

export const Avatar = () => {
  const handleClick = async () => {
    const avatarResponse = await axios.post('/api/avatar');
    logger.info('Avatar response: %o', avatarResponse);
  };

  return (
    <div className="mt-auto px-4 sm:px-4 lg:px-22 pb-8">
      Video here <Button label="Start session" onClick={handleClick} />
    </div>
  );
};
