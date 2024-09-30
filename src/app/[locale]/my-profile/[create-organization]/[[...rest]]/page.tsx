'use client';

import { CreateOrganization } from '@clerk/nextjs';

export default function OrganizationsPage() {
  return <CreateOrganization path="create-organization" />;
}
