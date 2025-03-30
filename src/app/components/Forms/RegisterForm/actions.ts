'use server';

import { logger } from '@/app/lib/utils/logger';

export const addSubscriberToKit = async (email: string) => {
  const KIT_API_KEY = process.env.KIT_API_KEY;

  try {
    if (KIT_API_KEY) {
      // there is a problem with axios in this server action and breaks flow
      await fetch('https://api.kit.com/v4/subscribers', {
        method: 'POST',
        body: JSON.stringify({
          email_address: email,
        }),
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'x-kit-api-key': KIT_API_KEY,
        },
      });
    }
  } catch (err) {
    logger.error({ err }, `Cannot add ${email} to kit.com`);
  }
};
