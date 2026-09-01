import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import { FileTypeFilterDropdown } from '../FileTypeFilterDropdown';
import { FileType } from '@/generated/prisma/browser';

const messages = {
  'files-table': {
    'filter-file-type': 'File type',
    'filter-file-type-all': 'All types',
  },
};

function renderDropdown(selected: FileType[] = [], onChange = vi.fn()) {
  return render(
    <NextIntlClientProvider messages={messages} locale="en">
      <FileTypeFilterDropdown selected={selected} onChange={onChange} />
    </NextIntlClientProvider>,
  );
}

describe('FileTypeFilterDropdown', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders trigger button with "All types" when nothing selected', () => {
    renderDropdown();
    expect(screen.getByRole('button')).toHaveTextContent('All types');
  });

  it('renders trigger button showing selected types when some are selected', () => {
    renderDropdown([FileType.PDF, FileType.DOCX]);
    expect(screen.getByRole('button')).toHaveTextContent('PDF');
    expect(screen.getByRole('button')).toHaveTextContent('DOCX');
  });

  it('opens dropdown with all file type options including PPTX on click', async () => {
    const user = userEvent.setup();
    renderDropdown();
    await user.click(screen.getByRole('button'));

    expect(screen.getByLabelText('PDF')).toBeInTheDocument();
    expect(screen.getByLabelText('DOCX')).toBeInTheDocument();
    expect(screen.getByLabelText('PPTX')).toBeInTheDocument();
    expect(screen.getByLabelText('XLSX')).toBeInTheDocument();
    expect(screen.getByLabelText('EPUB')).toBeInTheDocument();
    expect(screen.getByLabelText('SRT')).toBeInTheDocument();
  });

  it('calls onChange with added type when unchecked option is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderDropdown([FileType.PDF], onChange);
    await user.click(screen.getByRole('button'));
    await user.click(screen.getByLabelText('PPTX'));

    expect(onChange).toHaveBeenCalledWith(
      expect.arrayContaining([FileType.PDF, FileType.PPTX]),
    );
  });

  it('calls onChange with type removed when checked option is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderDropdown([FileType.PDF, FileType.PPTX], onChange);
    await user.click(screen.getByRole('button'));
    await user.click(screen.getByLabelText('PPTX'));

    expect(onChange).toHaveBeenCalledWith([FileType.PDF]);
  });

  it('closes dropdown when clicking outside', async () => {
    const user = userEvent.setup();
    renderDropdown();
    await user.click(screen.getByRole('button'));
    expect(screen.getByLabelText('PPTX')).toBeInTheDocument();

    await user.click(document.body);
    expect(screen.queryByLabelText('PPTX')).not.toBeInTheDocument();
  });

  it('renders PPTX checkbox as unchecked when not in selected', async () => {
    const user = userEvent.setup();
    renderDropdown([FileType.PDF]);
    await user.click(screen.getByRole('button'));

    const pptxCheckbox = screen.getByLabelText('PPTX');
    expect(pptxCheckbox).not.toBeChecked();
  });

  it('renders PPTX checkbox as checked when in selected', async () => {
    const user = userEvent.setup();
    renderDropdown([FileType.PPTX]);
    await user.click(screen.getByRole('button'));

    const pptxCheckbox = screen.getByLabelText('PPTX');
    expect(pptxCheckbox).toBeChecked();
  });
});
