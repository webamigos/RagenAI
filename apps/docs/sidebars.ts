import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docs: [
    'introduction',
    'self-hosting',
    'quickstart',
    'security',
    'concepts',
    'admin-panel',
    {
      type: 'category',
      label: 'API Reference',
      collapsed: false,
      items: [
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
