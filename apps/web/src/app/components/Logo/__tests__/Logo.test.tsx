import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Logo } from '../Logo';

const themeState: { theme?: string; resolvedTheme?: string } = {};

vi.mock('next-themes', () => ({
  useTheme: () => themeState,
}));

vi.mock('next/image', () => ({
  default: ({
    src,
    alt,
    ...props
  }: {
    src: string;
    alt: string;
    [key: string]: unknown;
    // eslint-disable-next-line @next/next/no-img-element -- the point of the mock is to drop next/image
  }) => <img src={src} alt={alt} {...props} />,
}));

vi.mock('@/i18n/routing', () => ({
  usePathname: () => '/threads',
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const clearVisitorMessagesStats = vi.fn();
vi.mock('../../../lib/services/api', () => ({
  clearVisitorMessagesStats: () => clearVisitorMessagesStats(),
}));

const handleCloseThread = vi.fn();
vi.mock('@/app/hooks/useCloseThreads', () => ({
  useCloseThread: () => ({ handleCloseThread }),
}));

describe('Logo', () => {
  beforeEach(() => {
    themeState.theme = 'light';
    themeState.resolvedTheme = 'light';
  });

  it('renders the light-background lockup for the light theme', () => {
    render(<Logo />);

    expect(screen.getByAltText('Logo')).toHaveAttribute(
      'src',
      '/assets/ragen-logo-on-light-bg.svg',
    );
  });

  it('renders the dark-background lockup for the dark theme', () => {
    themeState.theme = 'dark';
    themeState.resolvedTheme = 'dark';

    render(<Logo />);

    expect(screen.getByAltText('Logo')).toHaveAttribute(
      'src',
      '/assets/ragen-logo-on-dark-bg.svg',
    );
  });

  it('follows the system theme when no theme is set explicitly', () => {
    themeState.theme = 'system';
    themeState.resolvedTheme = 'dark';

    render(<Logo />);

    expect(screen.getByAltText('Logo')).toHaveAttribute(
      'src',
      '/assets/ragen-logo-on-dark-bg.svg',
    );
  });

  it('exposes the brand name to screen readers', () => {
    render(<Logo />);

    expect(screen.getByText('Ragen AI')).toBeInTheDocument();
  });

  it('closes the open thread when the logo is clicked', async () => {
    render(<Logo />);

    await userEvent.click(screen.getByAltText('Logo'));

    expect(handleCloseThread).toHaveBeenCalledWith(true);
  });

  it('does not close the thread when the link is disabled', async () => {
    render(<Logo disableLink />);

    await userEvent.click(screen.getByAltText('Logo'));

    expect(handleCloseThread).not.toHaveBeenCalled();
  });

  it('keeps the caller-supplied sizing class', () => {
    render(<Logo className="h-12" />);

    expect(screen.getByAltText('Logo')).toHaveClass('h-12');
  });
});
