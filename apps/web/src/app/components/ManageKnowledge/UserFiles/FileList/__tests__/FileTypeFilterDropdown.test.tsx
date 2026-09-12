import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import { FileTypeFilterDropdown } from '../FileTypeFilterDropdown';
import { FileType } from '@/generated/prisma/browser';

/*
  The real messages, not a fixture. A fixture declared in the test is the
  answer sheet: it cannot tell a missing key from a present one, which is how
  `document-preview.action-optimize` shipped with no translation anywhere.
*/
import messages from '@/app/messages/en.json';

/**
 * The chip's trigger, by its accessible name. `getByRole('button')` was
 * enough while the chip had one button; it now has a clear `×` as well
 * whenever a filter is set, and the ambiguity is the point of that control
 * existing.
 */
const trigger = () => screen.getByRole('button', { name: /^Type:/ });

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

  it('renders trigger button with "All" when nothing selected', () => {
    renderDropdown();
    expect(trigger()).toHaveTextContent('All');
  });

  it('renders trigger button showing selected types when some are selected', () => {
    renderDropdown([FileType.PDF, FileType.DOCX]);

    // The chip shows the first value and a count rather than growing with
    // the selection; the whole list is its accessible name and is in the
    // menu.
    expect(trigger()).toHaveTextContent('PDF +1');
    expect(trigger()).toHaveAccessibleName('Type: PDF, DOCX');
  });

  it('opens dropdown with all file type options including PPTX on click', async () => {
    const user = userEvent.setup();
    renderDropdown();
    await user.click(trigger());

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
    await user.click(trigger());
    await user.click(screen.getByLabelText('PPTX'));

    expect(onChange).toHaveBeenCalledWith(
      expect.arrayContaining([FileType.PDF, FileType.PPTX]),
    );
  });

  it('calls onChange with type removed when checked option is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderDropdown([FileType.PDF, FileType.PPTX], onChange);
    await user.click(trigger());
    await user.click(screen.getByLabelText('PPTX'));

    expect(onChange).toHaveBeenCalledWith([FileType.PDF]);
  });

  it('closes dropdown when clicking outside', async () => {
    const user = userEvent.setup();
    renderDropdown();
    await user.click(trigger());
    expect(screen.getByLabelText('PPTX')).toBeInTheDocument();

    await user.click(document.body);
    expect(screen.queryByLabelText('PPTX')).not.toBeInTheDocument();
  });

  it('renders PPTX checkbox as unchecked when not in selected', async () => {
    const user = userEvent.setup();
    renderDropdown([FileType.PDF]);
    await user.click(trigger());

    const pptxCheckbox = screen.getByLabelText('PPTX');
    expect(pptxCheckbox).not.toBeChecked();
  });

  it('renders PPTX checkbox as checked when in selected', async () => {
    const user = userEvent.setup();
    renderDropdown([FileType.PPTX]);
    await user.click(trigger());

    const pptxCheckbox = screen.getByLabelText('PPTX');
    expect(pptxCheckbox).toBeChecked();
  });
});
