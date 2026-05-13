import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';

const { mockRender, mockInitialize } = vi.hoisted(() => ({
  mockRender: vi.fn(),
  mockInitialize: vi.fn(),
}));

vi.mock('mermaid', () => ({
  default: {
    initialize: mockInitialize,
    render: mockRender,
  },
}));

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { MermaidBlock } from '../MermaidBlock';

describe('MermaidBlock', () => {
  beforeEach(() => {
    mockRender.mockResolvedValue({ svg: '<svg><text>diagram</text></svg>' });
  });

  it('renders the SVG returned by mermaid.render()', async () => {
    await act(async () => {
      render(<MermaidBlock code={'graph TD\n  A-->B'} />);
    });
    await waitFor(() => {
      expect(screen.getByText('diagram')).toBeInTheDocument();
    });
  });

  it('calls mermaid.render() with the provided code', async () => {
    const code = 'graph TD\n  A-->B';
    render(<MermaidBlock code={code} />);
    await waitFor(() => expect(mockRender).toHaveBeenCalledTimes(1));
    const [id, calledCode] = mockRender.mock.calls[0];
    expect(id).toMatch(/^mermaid-/);
    expect(calledCode).toBe(code);
  });

  it('renders a fallback code block on parse error', async () => {
    mockRender.mockRejectedValueOnce(new Error('Parse error'));
    await act(async () => {
      render(<MermaidBlock code="invalid mermaid syntax !!!" />);
    });
    await waitFor(() => {
      expect(
        screen.getByText('invalid mermaid syntax !!!'),
      ).toBeInTheDocument();
    });
  });

  it('mermaid.initialize() is called on each render with the correct theme', async () => {
    mockInitialize.mockClear();
    await act(async () => {
      render(<MermaidBlock code={'graph TD\n  A-->B'} />);
    });
    await waitFor(() => expect(mockRender).toHaveBeenCalledTimes(1));
    expect(mockInitialize).toHaveBeenCalledWith(
      expect.objectContaining({ startOnLoad: false, securityLevel: 'strict' }),
    );
  });
});
