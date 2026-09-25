'use client';

import ReactMarkdown, { type Components } from 'react-markdown';

import '@/app/components/Assistant/ChatOutput/chat-response.css';
import {
  isSourceLink,
  resolveBrainLink,
} from '@/features/brain-assistant/utils/brain-links';
import { Link } from '@/i18n/routing';

/**
 * An answer's text. Links are the assistant's `brain:` links only, opened in
 * the Brain view the operator is already in (not a new tab); a quote's
 * citation is drawn as a marker, the way the chat marks its sources. Any
 * other link is shown as its text — the model does not get to choose where a
 * click goes.
 */
export function AssistantAnswer({ text }: { text: string }) {
  return (
    <div className="chat-response text-sm">
      <ReactMarkdown
        // react-markdown drops unknown schemes by default; `brain:` is ours,
        // and every other href is dropped by the link renderer below anyway.
        urlTransform={(url) => url}
        components={COMPONENTS}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

const COMPONENTS: Components = {
  a: ({ href, children }) => {
    const target = resolveBrainLink(href);
    if (!target) {
      return <span>{children}</span>;
    }
    if (isSourceLink(href)) {
      return (
        <Link
          href={target}
          data-testid="brain-assistant-citation"
          className="mx-0.5 inline-flex items-center rounded-[4px] border border-border px-1 text-[11px] font-medium text-marker no-underline hover:bg-muted"
        >
          {children}
        </Link>
      );
    }
    return (
      <Link
        href={target}
        data-testid="brain-assistant-link"
        className="text-primary underline-offset-4 hover:underline"
      >
        {children}
      </Link>
    );
  },
  img: () => null,
};
