'use client';

import { parseMarkdownSegments } from './parse-markdown-segments';
import { MermaidBlock } from './MermaidBlock';

type Props = {
  content: string;
  renderAndSanitize: (markdown: string) => string;
  className?: string;
};

export function MarkdownWithMermaid({
  content,
  renderAndSanitize,
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
              __html: renderAndSanitize(segment.content),
            }}
          />
        );
      })}
    </>
  );
}
