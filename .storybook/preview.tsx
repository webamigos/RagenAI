import type { Preview } from '@storybook/react';
import '../src/app/[locale]/global.css';
import nextIntl from './next-intl';
import { ClerkProvider, ClerkProviderProps } from '@clerk/clerk-react';
import { StoryFn, StoryContext } from '@storybook/react';
import React from 'react';

const CLERK_API_KEY = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

const withClerkProvider = (Story: StoryFn, context: StoryContext) => {
  const clerkProps: ClerkProviderProps = {
    frontendApi: CLERK_API_KEY,
  };

  return (
    <ClerkProvider {...clerkProps}>
      <Story {...context} />
    </ClerkProvider>
  );
};

const preview: Preview = {
  parameters: {
    nextIntl,
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
  decorators: [withClerkProvider],
  initialGlobals: {
    locale: 'en',
    locales: {
      en: 'English',
      pl: 'Polish',
    },
  },
  tags: ['autodocs'],
};

export default preview;
