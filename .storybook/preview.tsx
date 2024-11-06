import React from 'react';
import type { Preview } from '@storybook/react';
import { ClerkProvider } from '@clerk/nextjs';
import { StoryFn, StoryContext } from '@storybook/react';

import nextIntl from './next-intl';
import '../src/app/[locale]/global.css';

const withClerkProvider = (Story: StoryFn, context: StoryContext) => {
  return (
    <ClerkProvider>
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
