import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Role } from '@/generated/prisma/browser';

vi.mock('@react-pdf/renderer', () => ({
  Document: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Page: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  View: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Text: ({
    children,
    render: renderProp,
  }: {
    children?: React.ReactNode;
    render?: (ctx: { pageNumber: number; totalPages: number }) => string;
  }) => {
    if (renderProp) {
      return <span>{renderProp({ pageNumber: 1, totalPages: 1 })}</span>;
    }
    return <span>{children}</span>;
  },
  StyleSheet: { create: (s: unknown) => s },
  Font: { register: vi.fn() },
}));

import { ThreadPDF } from '../ThreadPDF';

const baseDate = new Date('2024-03-15T10:30:00Z');

const baseData = {
  title: 'My Conversation',
  createdAt: baseDate,
  assistantName: 'Support Bot',
  messages: [
    {
      role: Role.USER,
      content: 'Hello, how are you?',
      createdAt: new Date('2024-03-15T10:30:00Z'),
    },
    {
      role: Role.ASSISTANT,
      content: 'I am doing great, thanks!',
      createdAt: new Date('2024-03-15T10:31:00Z'),
    },
  ],
  sources: [],
};

describe('ThreadPDF', () => {
  it('renders thread title', () => {
    render(<ThreadPDF data={baseData} />);
    expect(screen.getByText('My Conversation')).toBeTruthy();
  });

  it('falls back to "Conversation" when title is null', () => {
    render(<ThreadPDF data={{ ...baseData, title: null }} />);
    expect(screen.getByText('Conversation')).toBeTruthy();
  });

  it('renders export date as YYYY-MM-DD', () => {
    render(<ThreadPDF data={baseData} />);
    expect(screen.getByText(/2024-03-15/)).toBeTruthy();
  });

  it('renders assistantName when present', () => {
    render(<ThreadPDF data={baseData} />);
    expect(screen.getByText(/Support Bot/)).toBeTruthy();
  });

  it('does not render assistant line when assistantName is null', () => {
    render(<ThreadPDF data={{ ...baseData, assistantName: null }} />);
    expect(screen.queryByText(/Support Bot/)).toBeNull();
  });

  it('renders Polish label "Użytkownik" for user messages', () => {
    render(<ThreadPDF data={baseData} />);
    expect(screen.getByText('Użytkownik')).toBeTruthy();
  });

  it('renders Polish label "Asystent" for assistant messages', () => {
    render(<ThreadPDF data={baseData} />);
    expect(screen.getByText('Asystent')).toBeTruthy();
  });

  it('renders message timestamps as HH:mm', () => {
    render(<ThreadPDF data={baseData} />);
    expect(screen.getByText('10:30')).toBeTruthy();
    expect(screen.getByText('10:31')).toBeTruthy();
  });

  it('renders message content', () => {
    render(<ThreadPDF data={baseData} />);
    expect(screen.getByText('Hello, how are you?')).toBeTruthy();
    expect(screen.getByText('I am doing great, thanks!')).toBeTruthy();
  });

  it('does not render "Źródła" heading when sources is empty', () => {
    render(<ThreadPDF data={{ ...baseData, sources: [] }} />);
    expect(screen.queryByText('Źródła')).toBeNull();
  });

  it('renders "Źródła" heading and file names when sources are present', () => {
    render(
      <ThreadPDF
        data={{
          ...baseData,
          sources: [{ fileName: 'report.pdf' }, { fileName: 'data.xlsx' }],
        }}
      />,
    );
    expect(screen.getByText('Źródła')).toBeTruthy();
    expect(screen.getByText(/report\.pdf/)).toBeTruthy();
    expect(screen.getByText(/data\.xlsx/)).toBeTruthy();
  });
});
