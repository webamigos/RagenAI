import React from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@ragenai/common-ui/Button';
import { Text } from '@ragenai/common-ui/Text';
import { logger } from '../lib/utils/logger';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onReset?: () => void;
  t?: Record<string, string>;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

/**
 * A component that catches JavaScript errors anywhere in its child component tree,
 * logs those errors, and displays a fallback UI instead of the component tree that crashed.
 */
export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    logger.error(
      { err: error, info: errorInfo },
      'Error caught by ErrorBoundary'
    );
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: undefined });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render(): React.ReactNode {
    const { t } = this.props;

    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI
      return (
        <div className="p-4 border border-red-300 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300 rounded">
          <Text className="font-medium mb-2">{t?.error || 'Error'}</Text>
          <Text className="text-sm mb-4">
            {this.state.error?.message || 'Nieznany błąd aplikacji'}
          </Text>
          <Button
            className="py-1 px-3 text-sm bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 rounded"
            onClick={this.handleReset}
          >
            {t?.['try-again'] || 'Try again'}
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}

export function ErrorBoundaryWithTranslations(
  props: Omit<ErrorBoundaryProps, 't'>
) {
  const t = useTranslations('ErrorBoundary');

  const translations = {
    error: t('error'),
    'try-again': t('try-again'),
  };

  return <ErrorBoundary {...props} t={translations} />;
}

/**
 * A component that displays a fallback UI when an error occurs
 */
export function FileErrorFallback({
  error,
  resetErrorBoundary,
}: {
  error: Error;
  resetErrorBoundary: () => void;
}) {
  const t = useTranslations('ErrorBoundary');

  return (
    <div className="p-4 border border-red-300 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300 rounded">
      <Text className="font-medium mb-2">{t('file-error-fetching')}</Text>
      <pre className="text-sm bg-red-100 dark:bg-red-900/30 p-2 rounded mb-4 overflow-auto">
        {error.message}
      </pre>
      <Button
        className="py-1 px-3 text-sm bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 rounded"
        onClick={resetErrorBoundary}
      >
        {t('try-again')}
      </Button>
    </div>
  );
}
