import { clerkSetup } from '@clerk/testing/playwright';
import { test as setup } from '@playwright/test';

setup('global setup', async () => {
  await clerkSetup();

  if (
    !process.env.TESTS_CLERK_USER_USERNAME ||
    !process.env.TESTS_CLERK_USER_EMAIL ||
    !process.env.TESTS_CLERK_USER_PASSWORD
  ) {
    throw new Error(
      'Please provide TESTS_CLERK_USER_USERNAME and TESTS_CLERK_USER_EMAIL and TESTS_CLERK_USER_PASSWORD environment variables.'
    );
  }
});
