import { test, expect } from '@playwright/test';

// Server-side gate: unauthenticated visitors to /accept-invitation must be
// redirected to /sign-in with invitationId preserved. Runs unauthenticated —
// no storageState fixture.
test.describe('Accept invitation auth gate', () => {
  test('redirects unauthenticated user to sign-in with invitationId', async ({
    page,
  }) => {
    const token = 'TEST_TOKEN';
    await page.goto(`/pl/accept-invitation?token=${token}`);
    await expect(page).toHaveURL(
      new RegExp(`/pl/sign-in\\?invitationId=${token}`),
      { timeout: 10_000 },
    );
  });

  test('redirects to bare sign-in when no token is supplied', async ({
    page,
  }) => {
    await page.goto('/pl/accept-invitation');
    await expect(page).toHaveURL(/\/pl\/sign-in(?!\?)/, { timeout: 10_000 });
  });
});
