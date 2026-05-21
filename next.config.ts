import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone' as const,
  reactStrictMode: true,

  async headers() {
    return [
      {
        // CORS headers for chatbot widget JS — must be accessible cross-origin
        source: '/chatbot-widget.js',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
        ],
      },
      {
        // Security headers for all routes
        source: '/:path*',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(self), geolocation=()',
          },
          ...(process.env.NODE_ENV === 'production'
            ? [
                {
                  key: 'Strict-Transport-Security',
                  value: 'max-age=63072000; includeSubDomains; preload',
                },
              ]
            : []),
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
    // PDF.js worker alias for react-pdf
    config.resolve.alias['pdfjs-dist'] = require('path').resolve(
      __dirname,
      'node_modules/pdfjs-dist/legacy/build/pdf.js',
    );

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
