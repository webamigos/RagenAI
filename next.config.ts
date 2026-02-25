import path from 'node:path';
import createNextIntlPlugin from 'next-intl/plugin';

// Note: validateEnvs removed due to ESM import limitations with .ts files in .mjs
// Consider converting next.config.mjs to next.config.ts if env validation is needed

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const rewrites: { source: string; destination: string }[] = [];
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
    'thread-stream',
    '@hyzyla/pdfium',
    '@aws-sdk',
    '@prisma/adapter-pg',
    '@opentelemetry/api',
    '@opentelemetry/api-logs',
    '@opentelemetry/sdk-trace-node',
    '@opentelemetry/sdk-logs',
    '@opentelemetry/sdk-metrics',
    '@opentelemetry/resources',
    '@opentelemetry/instrumentation',
    '@opentelemetry/exporter-trace-otlp-http',
    '@opentelemetry/exporter-metrics-otlp-http',
    '@opentelemetry/exporter-logs-otlp-http',
    '@opentelemetry/instrumentation-http',
    '@opentelemetry/instrumentation-pg',
    '@prisma/instrumentation',
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
            resource.request = resource.request.replace(
              /serverLogger/,
              'clientLogger'
            );
          }
        )
      );

      // Prevent server-only modules from being bundled on client-side
      config.externals = config.externals || [];
      config.externals.push(
        'better-auth',
        'better-auth/adapters/prisma',
        'better-auth/plugins',
        'pino-pretty'
      );

      // Replace serverLogger with clientLogger on client-side
      config.resolve.alias = {
        ...config.resolve.alias,
        '@/app/lib/utils/logger/serverLogger':
          '@/app/lib/utils/logger/clientLogger',
      };

      // Redirect Prisma generated client to browser-safe version (no Node.js imports)
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(
          /generated\/prisma\/client/,
          (resource) => {
            resource.request = resource.request.replace(
              /generated\/prisma\/client/,
              'generated/prisma/browser'
            );
          }
        )
      );

      config.resolve.fallback = {
        ...config.resolve.fallback,
        child_process: false,
        fs: false,
        inspector: false,
        tls: false,
        net: false,
        async_hooks: false,
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
    }
    return config;
  },
};

export default withNextIntl(nextConfig);
