import createNextIntlPlugin from 'next-intl/plugin';

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
  reactStrictMode: true,

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
            value: '*',
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
  ],

  transpilePackages: ['better-auth'],

  webpack: (
    config: any,
    { isServer, webpack }: { isServer: boolean; webpack: any },
  ) => {
    if (!isServer) {
      // Replace serverLogger with clientLogger on client-side
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(
          /serverLogger/,
          (resource: any) => {
            resource.request = resource.request.replace(
              /serverLogger/,
              'clientLogger',
            );
          },
        ),
      );

      // Prevent server-only modules from being bundled on client-side
      config.externals = config.externals || [];
      config.externals.push(
        'better-auth',
        'better-auth/adapters/prisma',
        'better-auth/plugins',
        'pino-pretty',
      );

      config.resolve.alias = {
        ...config.resolve.alias,
        '@/app/lib/utils/logger/serverLogger':
          '@/app/lib/utils/logger/clientLogger',
      };

      // Redirect Prisma generated client to browser-safe version (no Node.js imports)
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(
          /generated\/prisma\/client/,
          (resource: any) => {
            resource.request = resource.request.replace(
              /generated\/prisma\/client/,
              'generated/prisma/browser',
            );
          },
        ),
      );

      config.resolve.fallback = {
        ...config.resolve.fallback,
        child_process: false,
        fs: false,
        inspector: false,
        tls: false,
        net: false,
        async_hooks: false,
        worker_threads: false,
        dns: false,
        module: false,
      };
    }

    return config;
  },
};

export default withNextIntl(nextConfig);
