'use server';

import { auth } from '@/lib/auth';
import { headers } from 'next/headers';

export type UserOrganization = {
  id: string;
  name: string;
  slug: string | null;
  logo: string | null;
};

export async function getUserOrganizationsQuery(): Promise<UserOrganization[]> {
  try {
    // @ts-ignore - Better Auth types don't expose listOrganizations yet
    const organizations = await (auth.api as any).listOrganizations({
      headers: await headers(),
    });

    if (!organizations || !Array.isArray(organizations)) {
      return [];
    }

    return organizations.map(
      (org: { id: string; name: string; slug?: string; logo?: string }) => ({
        id: org.id,
        name: org.name,
        slug: org.slug ?? null,
        logo: org.logo ?? null,
      }),
    );
  } catch {
    return [];
  }
}
