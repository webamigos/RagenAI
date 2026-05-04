'use client';

import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { logger } from '@/app/lib/utils/logger';

let initialized = false;

export function _resetInitializedForTests() {
  initialized = false;
}

function initMermaid() {
  if (initialized) {
    return;
  }
  const isDark = document.documentElement.classList.contains('dark');
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: isDark ? 'dark' : 'default',
  });
  initialized = true;
}

let idCounter = 0;

type Props = {
  code: string;
};

export function MermaidBlock({ code }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);
  const idRef = useRef(`mermaid-${++idCounter}`);

  useEffect(() => {
    let cancelled = false;

    async function renderDiagram() {
      try {
        initMermaid();
        const { svg } = await mermaid.render(idRef.current, code);
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
      } catch (err) {
        logger.error('MermaidBlock render error', err);
        if (!cancelled) {
          setError(true);
        }
      }
    }

    renderDiagram();

    return () => {
      cancelled = true;
    };
  }, [code]);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      initialized = false;
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => observer.disconnect();
  }, []);

  if (error) {
    return (
      <div className="code-wrapper">
        <pre className="hljs">
          <code>{code}</code>
        </pre>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="mermaid-diagram my-2 overflow-x-auto" />
  );
}
