'use client';

import { CreateOrganization } from '@clerk/nextjs';
import { Card } from '@salesyy/common-ui/Card';

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
