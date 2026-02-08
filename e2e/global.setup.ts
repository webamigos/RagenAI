import { test as setup } from '@playwright/test';

setup('global setup', async () => {
  if (!process.env.TEST_USER_EMAIL || !process.env.TEST_USER_PASSWORD) {
    throw new Error(
      'Please provide TEST_USER_EMAIL and TEST_USER_PASSWORD environment variables.'
    );
  }
});
