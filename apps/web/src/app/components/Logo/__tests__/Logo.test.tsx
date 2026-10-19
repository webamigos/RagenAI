import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Logo } from '../Logo';
import { InstanceBrandingProvider } from '@/context/InstanceBrandingContext';
import {
  DEFAULT_INSTANCE_BRANDING,
  type InstanceBranding,
} from '@/features/branding/contracts/branding.types';

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
     
  }) => {
    // `unoptimized` and `priority` are next/image props, not attributes.
    const { unoptimized: _u, priority: _p, ...rest } = props;
    return <img src={src} alt={alt} {...rest} />;
  },
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

  describe('with instance branding', () => {
    const renderWith = (
      branding: Partial<InstanceBranding>,
      props: Parameters<typeof Logo>[0] = {},
    ) =>
      render(
        <InstanceBrandingProvider
          branding={{ ...DEFAULT_INSTANCE_BRANDING, ...branding }}
        >
          <Logo {...props} />
        </InstanceBrandingProvider>,
      );

    it('draws the uploaded logo in both themes, and names the product', () => {
      renderWith({
        productName: 'Acme Knowledge',
        logoUrl: '/api/branding/logo?v=123',
        isCustom: true,
      });

      expect(screen.getByAltText('Logo')).toHaveAttribute(
        'src',
        '/api/branding/logo?v=123',
      );
      expect(screen.getByText('Acme Knowledge')).toHaveClass('sr-only');
      expect(screen.queryByText('Ragen AI')).not.toBeInTheDocument();
    });

    it('keeps the uploaded logo in the dark theme instead of the Ragen lockup', () => {
      themeState.theme = 'dark';
      themeState.resolvedTheme = 'dark';

      renderWith({ logoUrl: '/api/branding/logo?v=1', isCustom: true });

      expect(screen.getByAltText('Logo')).toHaveAttribute(
        'src',
        '/api/branding/logo?v=1',
      );
    });

    it('holds an uploaded logo by height in the sidebar, never stretching it', () => {
      renderWith(
        { logoUrl: '/api/branding/logo?v=1', isCustom: true },
        { compact: true },
      );

      expect(screen.getByAltText('Logo')).toHaveClass(
        'h-7',
        'w-auto',
        'object-contain',
      );
    });

    it('writes the product name as a wordmark when there is no logo', () => {
      renderWith({ productName: 'Acme Knowledge', isCustom: true });

      expect(screen.queryByAltText('Logo')).not.toBeInTheDocument();
      expect(screen.getByTestId('instance-wordmark')).toHaveTextContent(
        'Acme Knowledge',
      );
    });

    it('still closes the thread when the custom mark is clicked', async () => {
      renderWith({ productName: 'Acme Knowledge', isCustom: true });

      await userEvent.click(screen.getByTestId('instance-wordmark'));

      expect(handleCloseThread).toHaveBeenCalledWith(true);
    });

    it('renders the Ragen lockup when only the palette is custom', () => {
      renderWith({ palette: 'violet', isCustom: true });

      expect(screen.getByAltText('Logo')).toHaveAttribute(
        'src',
        '/assets/ragen-logo-on-light-bg.svg',
      );
    });

    it('marks the document with the palette, and nothing for the default', () => {
      const { container, unmount } = renderWith({
        palette: 'violet',
        isCustom: true,
      });
      expect(container.querySelector('[data-palette="violet"]')).not.toBeNull();
      unmount();

      const { container: plain } = renderWith({});
      expect(plain.querySelector('[data-palette]')).toBeNull();
    });
  });
});
