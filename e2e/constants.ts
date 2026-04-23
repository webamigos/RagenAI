import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const TEST_USER_EMAIL =
  process.env.TEST_USER_EMAIL || 'e2e-test@ragen.ai';
export const TEST_USER_PASSWORD =
  process.env.TEST_USER_PASSWORD || 'E2eTestPassword123!';
export const TEST_USER_ID = 'e2e-test-user-0000-0000-0001';
export const TEST_USER_NAME = 'E2E Test User';
export const TEST_ORG_ID = 'e2e-test-org-00000-0000-0001';
export const TEST_ORG_SLUG = 'e2e-test-org';
export const TEST_MEMBER_ID = 'e2e-test-member-000-0000-0001';
export const TEST_ACCOUNT_ID = 'e2e-test-account-00-0000-0001';
export const TEST_PROJECT_TITLE = 'E2E Test Project';
export const TEST_PROJECT_ID = 'e2e00000-0000-0000-0000-00e2e0000001';

export const TEST_THREAD_ID = 'e2e00000-0000-0000-0000-00e2e0000010';
export const TEST_THREAD_TITLE = 'E2E Seeded Thread';
export const TEST_MESSAGE_USER_ID = 'e2e00000-0000-0000-0000-00e2e0000011';
export const TEST_MESSAGE_ASSISTANT_ID = 'e2e00000-0000-0000-0000-00e2e0000012';

export const TEST_ORG2_ID = 'e2e-test-org-00000-0000-0002';
export const TEST_ORG2_SLUG = 'e2e-test-org-2';
export const TEST_ORG2_NAME = 'E2E Second Org';
export const TEST_MEMBER2_ID = 'e2e-test-member-000-0000-0002';

export const TEST_FILE_ID = 'e2e00000-0000-0000-0000-00e2e0000020';
export const TEST_FILE_NAME = 'e2e-test-document.txt';

export const AUTH_FILE = path.join(__dirname, '.auth', 'user.json');
