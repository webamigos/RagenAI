import { type Page } from '@playwright/test';

import { TEST_USER_EMAIL, TEST_USER_PASSWORD } from './constants';

export const ROUTES = {
  signIn: '/en/sign-in',
  signUp: '/en/sign-up',
  home: '/en',
  knowledgeUpload: '/en/knowledge/upload-files',
  knowledgeDocuments: '/en/knowledge/documents-list',
  projects: '/en/projects',
} as const;

export const LABELS = {
  signIn: /sign in/i,
  signOut: /sign out/i,
  newThread: /new thread/i,
  emailInvalid: /email is invalid/i,
  passwordTooShort: /password should have at least 8 characters/i,
  send: /send/i,
  uploadSuccess: /all files were uploaded/i,
  projectFileUploaded: /file has been uploaded|files uploaded/i,
  chooseFiles: /choose files from disk/i,
} as const;

export async function login(page: Page) {
  await page.goto(ROUTES.signIn);
  await page.locator('input[type="email"]').fill(TEST_USER_EMAIL);
  await page.locator('input[type="password"]').fill(TEST_USER_PASSWORD);
  await page.getByRole('button', { name: LABELS.signIn }).click();
  await page.waitForURL(ROUTES.home, { timeout: 15_000 });
}
