'use client';

import { CreateOrganization } from '@clerk/nextjs';

export const CreateOrganizationComponent = () => {
  return (
    <CreateOrganization
      appearance={{
        elements: {
          cardBox: 'h-1/2 shadow-none border-none',
          footer: 'hidden',
        },
      }}
    />
  );
};
