// Shared local configuration from the repository root. Real environment
// variables and this app's own .env files both win over it — see the
// function's own comment for why and for the ADR-29 history.
import '../../scripts/load-root-env.mjs';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['@prisma/adapter-pg'],
};

export default nextConfig;
