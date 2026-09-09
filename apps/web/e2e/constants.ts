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

/** Document in the active org, seeded with two versions. */
export const TEST_DOCUMENT_ID = 'e2e00000-0000-0000-0000-00e2e0000030';
export const TEST_DOCUMENT_TITLE = 'E2E Seeded Document';
export const TEST_DOCUMENT_V1_ID = 'e2e00000-0000-0000-0000-00e2e0000031';
export const TEST_DOCUMENT_V2_ID = 'e2e00000-0000-0000-0000-00e2e0000032';
export const TEST_DOCUMENT_V1_CONTENT =
  'First revision of the seeded document.';
export const TEST_DOCUMENT_V2_CONTENT =
  'Second revision of the seeded document.';

/**
 * Document belonging to the *other* organization. The test user is a member of
 * both, but only one is active — this is what the cross-tenant checks read.
 */
export const TEST_ORG2_DOCUMENT_ID = 'e2e00000-0000-0000-0000-00e2e0000040';
export const TEST_ORG2_DOCUMENT_V1_ID = 'e2e00000-0000-0000-0000-00e2e0000041';

/**
 * A second member of the *active* org, deliberately holding nothing: no
 * ownership, no `DocumentPermission` grant, no team. Everything the
 * access-control specs assert is about what this user cannot reach.
 */
export const TEST_OTHER_USER_ID = 'e2e-test-user-0000-0000-0002';
export const TEST_OTHER_USER_EMAIL = 'e2e-other@ragen.ai';
export const TEST_OTHER_USER_PASSWORD = 'E2eOtherPassword123!';
export const TEST_OTHER_USER_NAME = 'E2E Other User';
export const TEST_OTHER_MEMBER_ID = 'e2e-test-member-000-0000-0003';
export const TEST_OTHER_ACCOUNT_ID = 'e2e-test-account-00-0000-0002';

/**
 * Owned by TEST_USER and shared with nobody, with a document and one version
 * attached. The point of comparison for the other user's 404s.
 */
export const TEST_PRIVATE_FILE_ID = 'e2e00000-0000-0000-0000-00e2e0000050';
export const TEST_PRIVATE_FILE_NAME = 'e2e-private-document.txt';
export const TEST_PRIVATE_DOCUMENT_ID = 'e2e00000-0000-0000-0000-00e2e0000051';
export const TEST_PRIVATE_VERSION_ID = 'e2e00000-0000-0000-0000-00e2e0000052';
export const TEST_PRIVATE_CONTENT = 'Private to the seeded owner.';

/**
 * A file that exists only so `p0-21`'s delete test has something of its own to
 * destroy. That test used to take `button[aria-label="Actions"]` `.first()` —
 * whichever document happened to sort first — and on some orderings that was
 * the private fixture above. Deleting it set `user_documents.file_id` to null
 * (the relation is optional, so the FK is ON DELETE SET NULL), and
 * `canAccessDocument` then treated a document with no file as org-wide. Three
 * of `p0-26`'s assertions flipped from 404 to 200 and read as an authorization
 * regression in a spec nobody had touched.
 *
 * The flip was real, and it was the product's bug rather than the suite's: a
 * document now carries its own `ownerId`, so losing its file no longer widens
 * it. This fixture stays anyway — a delete test should own what it destroys,
 * whatever the access rules say.
 */
export const TEST_DISPOSABLE_FILE_ID = 'e2e00000-0000-0000-0000-00e2e0000060';
export const TEST_DISPOSABLE_FILE_NAME = 'e2e-disposable-document.txt';

export const AUTH_FILE = path.join(__dirname, '.auth', 'user.json');
