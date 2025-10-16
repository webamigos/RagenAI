'use client';

import axios from 'axios';

import { logger } from '@/app/lib/utils/logger';
import { Button } from '@ragenai/common-ui';

export const Avatar = () => {
  const handleClick = async () => {
    const avatarResponse = await axios.post('/api/avatar');
    logger.info('Avatar response: %o', avatarResponse);
  };

  return (
    <div className="mt-auto px-4 sm:px-4 lg:px-22 pb-8">
      Video here{' '}
      <Button onClick={handleClick} plain>
        Start session
      </Button>
    </div>
  );
};
