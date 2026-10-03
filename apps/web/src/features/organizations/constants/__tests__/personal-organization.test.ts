import { describe, expect, it } from 'vitest';

import { personalOrganizationSlug } from '../personal-organization';

describe('personalOrganizationSlug', () => {
  it('is the user id with an -org suffix, as existing rows already carry', () => {
    // Accounts created before this helper existed have slugs in this exact
    // shape, so changing it would orphan every one of them.
    expect(personalOrganizationSlug('abc123')).toBe('abc123-org');
  });
});
