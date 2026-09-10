'use client';

import { parseMarkdownSegments } from './parse-markdown-segments';
import { MermaidBlock } from './MermaidBlock';

type Props = {
  content: string;
  renderAndSanitize: (markdown: string) => string;
  /**
   * Applied to the sanitized HTML, never to the markdown. Anything that has
   * to tell a code block from prose belongs here rather than in a pattern
   * over the source, because by this point the code block is a `<pre>`.
   */
  transformHtml?: (html: string) => string;
  className?: string;
};

export function MarkdownWithMermaid({
  content,
  renderAndSanitize,
  transformHtml,
  className,
}: Props) {
  const segments = parseMarkdownSegments(content);

  return (
    <>
      {segments.map((segment, index) => {
        if (segment.type === 'mermaid') {
          return <MermaidBlock key={index} code={segment.code} />;
        }
        return (
          <div
            key={index}
            className={className}
            dangerouslySetInnerHTML={{
              __html: transformHtml
                ? transformHtml(renderAndSanitize(segment.content))
                : renderAndSanitize(segment.content),
            }}
          />
        );
      })}
    </>
  );
}
