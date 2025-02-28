import { withSentryConfig } from '@sentry/nextjs';
import createNextIntlPlugin from 'next-intl/plugin';

import validateEnvs from './src/validateEnvVars.js';

const validateEnvsResult = validateEnvs();

if (!validateEnvsResult.success) {
  // eslint-disable-next-line no-console
  console.error(
    'Environment variable validation errors:',
    validateEnvsResult.error.format()
  );
  process.exit(1);
}

const withNextIntl = createNextIntlPlugin();

const isProductionTargetEnv = process.env.TARGET_ENV === 'production';
const isStagingTargetEnv = process.env.TARGET_ENV === 'staging';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true, // false is only for local debugging
  swcMinify: true,
  images: {
    domains: ['img.clerk.com', 'files.stripe.com', 'images.unsplash.com'],
  },

  // TODO: cloudflare config
  // async rewrites() {
  //   return [
  //     {
  //       source: 'https://api.ragen.io',
  //       destination: '/api',
  //     },
  //   ];
  // },

  async headers() {
    return [
      {
        source: '/api/v1/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: '*', // Set your origin
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, PUT, DELETE, OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type, Authorization, X-API-KEY, x-api-key',
          },
        ],
      },
    ];
  },

  experimental: {
    serverComponentsExternalPackages: [
      'pino',
      'pino-pretty',
      'pino-sentry',
      '@sentry/node',
      '@hyzyla/pdfium',
      '@aws-sdk',
      '@langchain/core',
      'langchain',
      '@langchain/community',
    ],
  },

  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        child_process: false, // for pino-sentry server logging
        fs: false, // for pino-sentry server logging
        inspector: false, // for pino-sentry server logging
        tls: false, // for pino-sentry server logging
        net: false, // for pino-sentry server logging
        async_hooks: false, // for pino-sentry server logging
        diagnostics_channel: false, // for playwright
        worker_threads: false,
      };
    } else {
      // Setting `resolve.alias` to `false` will tell webpack to ignore a module.
      // `msw/node` is a server-only module that exports methods not available in
      // the `browser`.
      config.resolve.alias = {
        ...config.resolve.alias,
        'msw/browser': false,
      };
      // https://github.com/open-telemetry/opentelemetry-js/issues/4173
      config.ignoreWarnings = [{ module: /opentelemetry/ }];
    }
    return config;
  },
};

export default !(isProductionTargetEnv || isStagingTargetEnv)
  ? withNextIntl(nextConfig)
  : withSentryConfig(withNextIntl(nextConfig), {
      // For all available options, see:
      // https://github.com/getsentry/sentry-webpack-plugin#options

      org: 'web-amigos',
      project: 'ragen-app',

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
