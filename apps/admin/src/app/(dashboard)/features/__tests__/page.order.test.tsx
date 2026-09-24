// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    organization: {
      findMany: vi.fn().mockResolvedValue([{ id: 'org-1', name: 'Demo' }]),
    },
  },
}));
vi.mock('../actions', () => ({
  getPlatformFeatureDefaultsAction: vi.fn().mockResolvedValue({}),
  getOrgFeatureOverridesAction: vi.fn().mockResolvedValue({}),
  getOrgFeatureResolutionAction: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/app/components/SearchableSelect', () => ({
  SearchableSelect: () => <select aria-label="organization" />,
}));
vi.mock('../PlatformFeaturesForm', () => ({
  PlatformFeaturesForm: () => null,
}));
vi.mock('../OrgFeaturesForm', () => ({ OrgFeaturesForm: () => null }));

import FeaturesPage from '../page';

describe('Features page', () => {
  it('puts the organization picker above the platform defaults', async () => {
    render(await FeaturesPage({ searchParams: Promise.resolve({}) }));

    const headings = screen
      .getAllByRole('heading', { level: 2 })
      .map((h) => h.textContent);
    expect(headings.indexOf('Pick organization')).toBeLessThan(
      headings.indexOf('Platform defaults'),
    );
    expect(headings.indexOf('Pick organization')).toBe(0);
  });
});
