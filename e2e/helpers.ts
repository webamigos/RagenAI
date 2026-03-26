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
  publicAssistant: (accessToken: string) =>
    `/pl/public/assistants/${accessToken}`,
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
  // Thread actions
  threadDelete: /usuń/i,
  threadRename: /zmień nazwę/i,
  threadStar: /przypnij/i,
  threadDeleteTitle: /usuń wątek/i,
  threadRenameTitle: /zmień nazwę wątku/i,
  cancel: /anuluj/i,
  save: /zapisz/i,
  // Projects
  createProject: /nowy asystent/i,
  createProjectSubmit: /stwórz/i,
  projectCreated: /asystent został pomyślnie utworzony/i,
  projectInstructions: /instrukcje/i,
  instructionsSaved: /instrukcja została zapisana/i,
  // Knowledge base
  deleteFile: /usuń/i,
  deleteFileTitle: /usuń plik/i,
  addFromUrlSubmit: /załaduj wiedzę/i,
  urlLoaded: /wiedza pobrana pomyślnie/i,
  // Thread actions (continued)
  threadUnstar: /odepnij/i,
  threadShare: /udostępnij/i,
  // Organization members
  inviteMember: /zaproś użytkownika/i,
  sendInvitation: /wyślij zaproszenie/i,
  changeToAdmin: /zmień na administratora/i,
  changeToMember: /zmień na użytkownika/i,
  removeMember: /usuń/i,
  confirmRemoveMember: /czy na pewno chcesz usunąć tego użytkownika/i,
  membersTab: /użytkownicy/i,
  invitationsTab: /zaproszenia/i,
  generalTab: /ogólne/i,
  // Connectors
  connectorsTitle: /integracje/i,
  connect: /połącz/i,
  disconnect: /rozłącz/i,
  apiKeyPlaceholder: /wprowadź klucz api/i,
  // Public/shared access
  shareKnowledge: /udostępnij wiedzę asystenta/i,
  sharePublicly: /udostępnij wiedzę asystenta publicznie/i,
  copyLink: /kopiuj link publiczny/i,
  disablePublicAccess: /wyłącz dostęp publiczny/i,
  shareThread: /udostępnij wątek/i,
  shareThreadSave: /zapisz/i,
  shareThreadSuccess: /udostępnianie wątku zaktualizowane/i,
  // Search
  searchPlaceholder: /szukaj czatów i asystentów/i,
  searchNoResults: /brak wyników/i,
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

/**
 * Build a mock SSE response body for the chat streaming API.
 * Returns a string of SSE events that the UI can parse.
 */
export function buildMockSSE(options: {
  userMessageId?: string;
  assistantMessageId?: string;
  content: string;
}): string {
  const {
    userMessageId = 'mock-user-msg-001',
    assistantMessageId = 'mock-assistant-msg-001',
    content,
  } = options;

  const events = [
    `event: user_message_created\ndata: ${JSON.stringify({ id: userMessageId })}\n\n`,
    ...content
      .split(' ')
      .map(
        (word, i) =>
          `event: delta\ndata: ${JSON.stringify({ content: (i > 0 ? ' ' : '') + word })}\n\n`,
      ),
    `event: assistant_message_created\ndata: ${JSON.stringify({ id: assistantMessageId })}\n\n`,
    `event: end\ndata: {}\n\n`,
  ];
  return events.join('');
}
