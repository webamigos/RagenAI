import { withSentryConfig } from '@sentry/nextjs';
import createNextIntlPlugin from 'next-intl/plugin';

// Note: validateEnvs removed due to ESM import limitations with .ts files in .mjs
// Consider converting next.config.mjs to next.config.ts if env validation is needed

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const isProductionTargetEnv = process.env.TARGET_ENV === 'production';
const isStagingTargetEnv = process.env.TARGET_ENV === 'staging';

const rewrites = [];
const IS_API_MODE = process.env.IS_API_MODE === '1';

if (IS_API_MODE) {
  // API instance - rewrites paths to /api
  // eg. https://api.ragen.io/api/v1 -> https://api.ragen.io/v1
  rewrites.push({
    source: '/:path*',
    destination: '/api/:path*',
  });
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true, // false is only for local debugging
  images: {
    remotePatterns: [
      { hostname: 'img.clerk.com' },
      { hostname: 'files.stripe.com' },
      { hostname: 'images.unsplash.com' },
    ],
  },

  async rewrites() {
    return {
      beforeFiles: rewrites,
    };
  },

  async headers() {
    return [
      {
        source: '/v1/:path*',
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

  serverExternalPackages: [
    'pino',
    'pino-pretty',
    'pino-sentry',
    '@sentry/node',
    '@hyzyla/pdfium',
    '@aws-sdk',
    '@prisma/adapter-pg',
    // Note: better-auth removed from serverExternalPackages to allow client-side usage
  ],


  transpilePackages: ['better-auth'],

  webpack: (config, { isServer, webpack }) => {
    // Handle Node.js protocol imports (node:stream, node:crypto, etc.) used by Better Auth and pino-pretty
    const nodeModules = [
      'stream',
      'crypto',
      'buffer',
      'util',
      'path',
      'fs',
      'os',
      'http',
      'https',
      'url',
      'zlib',
      'querystring',
      'events',
      'process',
      'assert',
      'constants',
      'worker_threads',
      'child_process',
      'net',
      'tls',
      'dns',
      'dgram',
      'async_hooks',
      'module',
    ];

    // Replace node: protocol imports with standard module names
    nodeModules.forEach((module) => {
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(
          new RegExp(`^node:${module}$`),
          module
        )
      );
    });

    if (!isServer) {
      // Replace serverLogger with clientLogger on client-side using NormalModuleReplacementPlugin
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(
          /serverLogger/,
          (resource) => {
            resource.request = resource.request.replace(/serverLogger/, 'clientLogger');
          }
        )
      );

      // Prevent server-only modules from being bundled on client-side
      config.externals = config.externals || [];
      config.externals.push(
        'better-auth',
        'better-auth/adapters/prisma',
        'better-auth/plugins',
        'pino',
        'pino-pretty',
        'pino-sentry'
      );

      // Replace serverLogger with clientLogger on client-side
      config.resolve.alias = {
        ...config.resolve.alias,
        '@/app/lib/utils/logger/serverLogger': '@/app/lib/utils/logger/clientLogger',
      };

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
        dns: false, // for pg (Prisma adapter)
        module: false, // for @prisma/client runtime
        // Better Auth fallbacks for client-side
        crypto: false,
        stream: false,
        buffer: false,
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

      // Automatically tree-shake Sentry logger statements to reduce bundle size
      disableLogger: true,

      // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
      // See the following for more information:
      // https://docs.sentry.io/product/crons/
      // https://vercel.com/docs/cron-jobs
      automaticVercelMonitors: true,
    });
