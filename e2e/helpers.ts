import { type Page } from '@playwright/test';

import { TEST_USER_EMAIL, TEST_USER_PASSWORD } from './constants';

export const CREDENTIALS = {
  email: TEST_USER_EMAIL,
  password: TEST_USER_PASSWORD,
} as const;

export const ROUTES = {
  signIn: '/pl/sign-in',
  signUp: '/pl/sign-up',
  home: '/pl',
  knowledgeUpload: '/pl/knowledge/upload-files',
  knowledgeDocuments: '/pl/knowledge/documents-list',
  projects: '/pl/projects',
} as const;

export const LABELS = {
  signOut: /wyloguj się/i,
  newThread: /nowy wątek/i,
  emailInvalid: /nieprawidłowy adres email/i,
  passwordTooShort: /hasło musi mieć co najmniej 8 znaków/i,
  send: /wyślij/i,
  uploadSuccess: /pliki zostały wgrane/i,
  projectFileUploaded: /plik został wgrany/i,
  chooseFiles: /wybierz pliki z dysku/i,
} as const;

/**
 * Log in via the UI and wait for redirect.
 * Login uses window.location.href (hard navigation), allow extra time.
 */
export async function login(page: Page) {
  await page.goto(ROUTES.signIn);
  await page.locator('input[type="email"]').fill(CREDENTIALS.email);
  await page.locator('input[type="password"]').fill(CREDENTIALS.password);
  await page.getByTestId('sign-in-submit').click();
  await page.waitForURL('**/pl/new', { timeout: 15_000 });
}
