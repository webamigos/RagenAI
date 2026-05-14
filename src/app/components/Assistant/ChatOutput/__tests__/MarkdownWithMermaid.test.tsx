import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const { mockRender } = vi.hoisted(() => ({
  mockRender: vi.fn(),
}));

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: mockRender,
  },
}));

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { MarkdownWithMermaid } from '../MarkdownWithMermaid';

const renderAndSanitize = (content: string) => `<p>${content}</p>`;

describe('MarkdownWithMermaid', () => {
  it('renders plain markdown through renderAndSanitize', () => {
    render(
      <MarkdownWithMermaid
        content="Hello world"
        renderAndSanitize={renderAndSanitize}
      />,
    );
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  it('renders a mermaid block via MermaidBlock, not renderAndSanitize', async () => {
    mockRender.mockResolvedValue({ svg: '<svg><text>mydiagram</text></svg>' });
    const spy = vi.fn(renderAndSanitize);

    render(
      <MarkdownWithMermaid
        content={'```mermaid\ngraph TD\n  A-->B\n```'}
        renderAndSanitize={spy}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('mydiagram')).toBeInTheDocument();
    });
    expect(spy).not.toHaveBeenCalledWith(expect.stringContaining('mermaid'));
  });

  it('renders mixed content in the correct order', async () => {
    mockRender.mockResolvedValue({ svg: '<svg><text>thediagram</text></svg>' });

    render(
      <MarkdownWithMermaid
        content={'before\n```mermaid\ngraph TD\n  A-->B\n```\nafter'}
        renderAndSanitize={renderAndSanitize}
      />,
    );

    expect(screen.getByText('before')).toBeInTheDocument();
    expect(screen.getByText('after')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('thediagram')).toBeInTheDocument();
    });
  });
});
