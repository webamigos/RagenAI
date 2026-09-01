'use client';

import { useState, useRef, useCallback } from 'react';

type GeneratorState = {
  output: string;
  isGenerating: boolean;
  error: string | null;
};

export function useDocumentGenerator() {
  const [state, setState] = useState<GeneratorState>({
    output: '',
    isGenerating: false,
    error: null,
  });
  const abortControllerRef = useRef<AbortController | null>(null);

  const generate = useCallback(async (content: string) => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setState({ output: '', isGenerating: true, error: null });

    try {
      const response = await fetch('/api/knowledge/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        throw new Error(
          errorBody?.error ?? `Request failed with status ${response.status}`,
        );
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response stream');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) {
            continue;
          }

          const data = line.slice(6);
          if (data === '[DONE]') {
            setState((prev) => ({ ...prev, isGenerating: false }));
            return;
          }

          try {
            const parsed = JSON.parse(data) as
              { text: string } | { error: string };
            if ('error' in parsed) {
              throw new Error(parsed.error);
            }
            setState((prev) => ({
              ...prev,
              output: prev.output + parsed.text,
            }));
          } catch (e) {
            if (e instanceof SyntaxError) {
              continue;
            }
            throw e;
          }
        }
      }

      setState((prev) => ({ ...prev, isGenerating: false }));
    } catch (err) {
      if (controller.signal.aborted) {
        return;
      }
      setState((prev) => ({
        ...prev,
        isGenerating: false,
        error: err instanceof Error ? err.message : 'Generation failed',
      }));
    }
  }, []);

  const reset = useCallback(() => {
    abortControllerRef.current?.abort();
    setState({ output: '', isGenerating: false, error: null });
  }, []);

  const abort = useCallback(() => {
    abortControllerRef.current?.abort();
    setState((prev) => ({ ...prev, isGenerating: false }));
  }, []);

  return {
    output: state.output,
    isGenerating: state.isGenerating,
    error: state.error,
    generate,
    reset,
    abort,
  };
}
