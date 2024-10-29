import { withSentryConfig } from '@sentry/nextjs';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true, // false is only for local debugging
  swcMinify: true,
  images: {
    domains: ['img.clerk.com'],
  },

  experimental: {
    serverComponentsExternalPackages: [
      'pino',
      'pino-pretty',
      'pino-sentry',
      '@sentry/node',
      // 'pino-sentry-transport',
    ],
  },

  webpack: (config, { isServer }) => {
    if (isServer) {
      // Setting `resolve.alias` to `false` will tell webpack to ignore a module.
      // `msw/node` is a server-only module that exports methods not available in
      // the `browser`.
      config.resolve.alias = {
        ...config.resolve.alias,
        'msw/browser': false,
      };
    } else {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        child_process: false, // for pino-sentry server logging
        fs: false, // for pino-sentry server logging
        inspector: false, // for pino-sentry server logging
        tls: false, // for pino-sentry server logging
        worker_threads: false, // for pino-sentry server logging
        net: false, // for pino-sentry server logging
        async_hooks: false, // for pino-sentry server logging
        diagnostics_channel: false, // for playwright
      };
    }
    return config;
  },
};

const sentryDsn = process.env.SENTRY_DSN;
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction && !sentryDsn) {
  throw new Error('SENTRY_DSN env variable is missing');
}

export default !isProduction
  ? withNextIntl(nextConfig)
  : withSentryConfig(withNextIntl(nextConfig), {
      // For all available options, see:
      // https://github.com/getsentry/sentry-webpack-plugin#options

      org: 'web-amigos',
      project: 'smartrag-app',

      // Only print logs for uploading source maps in CI
      silent: !process.env.CI,

      // For all available options, see:
      // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

      // Upload a larger set of source maps for prettier stack traces (increases build time)
      widenClientFileUpload: true,

      // Uncomment to route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
      // This can increase your server load as well as your hosting bill.
      // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
      // side errors will fail.
      // tunnelRoute: "/monitoring",

      // Hides source maps from generated client bundles
      hideSourceMaps: true,

      // Automatically tree-shake Sentry logger statements to reduce bundle size
      disableLogger: true,

      // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
      // See the following for more information:
      // https://docs.sentry.io/product/crons/
      // https://vercel.com/docs/cron-jobs
      automaticVercelMonitors: false,
    });
