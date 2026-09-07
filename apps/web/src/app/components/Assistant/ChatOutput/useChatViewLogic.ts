import { useUser } from '@/app/hooks/use-auth';
import { useState, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
// Use the pre-built UMD bundle — Turbopack has a bug with markdown-it's ESM
// build where named re-exports (isSpace) are lost during bundling.
// @ts-ignore -- UMD bundle has no type declarations
import MarkdownIt from 'markdown-it/dist/markdown-it.js';
import { applyLinkifyPolicy } from '@/libs/markdown/linkify-policy';
import hljs from 'highlight.js';
import texmath from 'markdown-it-texmath';
// @ts-ignore -- CJS plugin, types resolve via @types/markdown-it-container
import markdownItContainer from 'markdown-it-container';
import katex from 'katex';
import DOMPurify from 'dompurify';

import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github-dark.css';

import type { StreamedMessageDto } from '@/features/messages/contracts/message.types';
import { logger } from '@/app/lib/utils/logger';
import {
  rewriteLinksInHtml,
  parseTrustedDomains,
} from '@/libs/security/link-rewriter';

/**
 * Client-side trusted-link allowlist. The raw list comes from
 * `NEXT_PUBLIC_TRUSTED_LINK_DOMAINS` so it reaches the browser (Next.js
 * only inlines `NEXT_PUBLIC_*` vars into client bundles). Parsed once
 * at module load — no reason to re-parse on every render.
 */
const TRUSTED_DOMAINS = parseTrustedDomains(
  process.env.NEXT_PUBLIC_TRUSTED_LINK_DOMAINS,
);

export const createMarkdownRenderer = () => {
  const md = new MarkdownIt({
    linkify: true,
    highlight: (code, lang) => {
      try {
        let highlightedCode;
        if (lang && hljs.getLanguage(lang)) {
          highlightedCode = hljs.highlight(code, { language: lang }).value;
        } else {
          highlightedCode = hljs.highlightAuto(code).value;
        }
        return `<div class="code-wrapper"><pre class="hljs"><code>${highlightedCode}</code></pre></div>`;
      } catch (error) {
        logger.error('Error highlighting code:', error);
        return code;
      }
    },
  });

  md.use(texmath, {
    engine: katex,
    delimiters: 'brackets',
    katexOptions: { throwOnError: false },
  });

  // Callout / admonition blocks. Use a single `::: callout [type] [title]`
  // syntax so the model has one lever rather than N. Shipped variants:
  //   ::: summary   (yellow — scoring verdict / tl;dr)
  //   ::: warning   (red — wykreślona, upadłość, expensive op about to run)
  //   ::: tip       (blue — optional follow-up suggestion)
  //   ::: info      (gray — neutral aside)
  //
  // Example emitted by the model:
  //
  //   ::: summary Fit dla VHS: średni (54/100)
  //   Firma raczej średni fit — kluczowe ograniczenie to skala (~12M).
  //   :::
  //
  // Renderer emits `<div class="callout callout-{type}">` + optional
  // `<div class="callout-title">`, body rendered as inline markdown.
  // DOMPurify's default allowlist permits `<div>` with `class` attr;
  // nothing else needs changing at the sanitizer boundary.
  const CALLOUT_TYPES = ['summary', 'warning', 'tip', 'info', 'note'] as const;
  const calloutHeader = /^(summary|warning|tip|info|note)(?:\s+(.+))?$/;
  for (const type of CALLOUT_TYPES) {
    md.use(markdownItContainer, type, {
      validate: (params: string) => {
        return (
          calloutHeader.test(params.trim()) && params.trim().startsWith(type)
        );
      },
      render: (tokens: any, idx: any) => {
        const token = tokens[idx];
        if (token.nesting === 1) {
          const match = calloutHeader.exec(token.info.trim());
          const title = match?.[2];
          const titleHtml = title
            ? `<div class="callout-title">${md.utils.escapeHtml(title)}</div>`
            : '';
          return `<div class="callout callout-${type}">${titleHtml}\n`;
        }
        return `</div>\n`;
      },
    });
  }

  // Open all links in new tab
  const defaultLinkRender =
    md.renderer.rules.link_open ||
    ((tokens: any, idx: any, options: any, _env: any, self: any) =>
      self.renderToken(tokens, idx, options));

  md.renderer.rules.link_open = (
    tokens: any,
    idx: any,
    options: any,
    env: any,
    self: any,
  ) => {
    tokens[idx].attrSet('target', '_blank');
    tokens[idx].attrSet('rel', 'noopener noreferrer');
    return defaultLinkRender(tokens, idx, options, env, self);
  };

  // Filenames are not domains — see libs/markdown/linkify-policy.
  return applyLinkifyPolicy(md);
};

/**
 * Phase 5 hardened DOMPurify config.
 *
 * Additions over the previous baseline:
 *   - `ALLOWED_URI_REGEXP` restricts `href`/`src` to http, https,
 *     mailto, tel, fragment, and root-relative paths. This is how
 *     `javascript:`, `data:`, `vbscript:`, `file:`, and other
 *     unsafe URI schemes get stripped at the sanitizer boundary —
 *     belt to the link rewriter's suspenders below.
 *   - `FORBID_ATTR` explicitly removes the most common event-handler
 *     and formaction attributes. DOMPurify already strips most of
 *     these by default, but being explicit (a) documents intent and
 *     (b) protects against future DOMPurify version regressions.
 *
 * Protocol-relative URL defence:
 * The negative lookahead `\/(?!\/)` accepts a single-slash root-
 * relative path (`/settings`) but rejects protocol-relative URLs
 * like `//evil.com` which would otherwise inherit the page's
 * protocol and navigate to an arbitrary external host. Without
 * this guard, an attacker could smuggle cross-origin links through
 * the sanitizer as "root-relative."
 */
const ALLOWED_URI_REGEXP = /^(?:(?:https?|mailto|tel):|#|\/(?!\/))/i;

const sanitizeHtml = (html: string): string => {
  return DOMPurify.sanitize(html, {
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form'],
    FORBID_ATTR: [
      'onclick',
      'onerror',
      'onload',
      'onmouseover',
      'onmouseout',
      'onfocus',
      'onblur',
      'onsubmit',
      'onchange',
      'onkeydown',
      'onkeyup',
      'onkeypress',
      'formaction',
      'action',
    ],
    ALLOWED_URI_REGEXP,
    ALLOW_ARIA_ATTR: true,
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ['target', 'rel', 'data-ragen-link'],
  });
};

export const useChatViewLogic = (
  streamedMessage: StreamedMessageDto | null,
) => {
  const [renderedStreamedMessage, setRenderedStreamedMessage] = useState('');
  const [streamedMessageRunId, setStreamedMessageRunId] = useState<string>();

  const { user } = useUser();
  const userAvatar = user?.image;
  const t = useTranslations('chat');

  const md = useMemo(() => createMarkdownRenderer(), []);

  const renderAndSanitize = useMemo(() => {
    return (content: string) => {
      // Order matters: sanitize first (strips dangerous URIs + tags),
      // THEN rewrite external links. Rewriting first would give the
      // sanitizer a chance to strip our `/r?u=...` hrefs because it
      // would see them as relative-to-untrusted-origin links.
      const sanitized = sanitizeHtml(md.render(content));
      return rewriteLinksInHtml(sanitized, {
        trustedDomains: TRUSTED_DOMAINS,
      });
    };
  }, [md]);

  useEffect(() => {
    if (streamedMessage) {
      const rendered = renderAndSanitize(streamedMessage.content);
      const runId = streamedMessage.runId;
      setRenderedStreamedMessage(rendered);
      setStreamedMessageRunId(runId);
    }
  }, [streamedMessage, md, renderAndSanitize]);

  return {
    t,
    md,
    renderAndSanitize,
    userAvatar,
    streamedMessageRunId,
    renderedStreamedMessage,
  };
};
