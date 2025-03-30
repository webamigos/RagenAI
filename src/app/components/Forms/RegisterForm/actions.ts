'use server';

import axios from 'axios';
import { logger } from '@/app/lib/utils/logger';

export const addSubscriberToKit = async (email: string) => {
  const KIT_API_KEY = process.env.KIT_API_KEY;
  try {
    const response = await axios.post(
      'https://api.kit.com/v4/subscribers',
      {
        email_address: email,
      },
      {
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'x-kit-api-key': `Bearer ${KIT_API_KEY}`,
        },
      }
    );

    return response;
  } catch (err) {
    logger.error({ err }, `Cannot add ${email} to kit.com`);
  }
};
