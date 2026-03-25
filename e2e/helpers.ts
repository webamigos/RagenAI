import { type Page } from '@playwright/test';

import { TEST_USER_EMAIL, TEST_USER_PASSWORD } from './constants';

export const CREDENTIALS = {
  email: TEST_USER_EMAIL,
  password: TEST_USER_PASSWORD,
} as const;

export const ROUTES = {
  signIn: '/pl/sign-in',
  signUp: '/pl/sign-up',
  forgotPassword: '/pl/forgot-password',
  home: '/pl',
  newChat: '/pl/new',
  chats: '/pl/chats',
  assistants: '/pl/assistants',
  knowledgeUpload: '/pl/knowledge/upload-files',
  knowledgeDocuments: '/pl/knowledge/documents-list',
  knowledgeCreate: '/pl/knowledge/create-document',
  knowledgeFromUrl: '/pl/knowledge/add-from-url',
  projects: '/pl/projects',
  userProfile: '/pl/user/profile',
  support: '/pl/support',
  settingsGeneral: '/pl/settings/general',
  settingsAccount: '/pl/settings/account',
  settingsConnectors: '/pl/settings/connectors',
  settingsOrganization: '/pl/settings/organization-profile',
  settingsPromptManagement: '/pl/settings/prompt-management',
  settingsSubscription: '/pl/settings/subscription',
  settingsTeams: '/pl/settings/teams',
  settingsUsers: '/pl/settings/users',
  settingsAiUsage: '/pl/settings/ai-usage',
  settingsDiskUsage: '/pl/settings/disk-usage',
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
