import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docs: [
    'introduction',
    'quickstart',
    'self-hosting',
    'open-models',
    'security',
    'concepts',
    'admin-panel',
    'oauth-sign-in',
    'configuration-reference',
    {
      type: 'category',
      label: 'API Reference',
      collapsed: false,
      items: [
        'api-reference/quickstart',
        'api-reference/chat-completions',
        'api-reference/files',
        'api-reference/assistants',
        'api-reference/threads',
        'api-reference/chat',
      ],
    },
  ],
};

export default sidebars;
