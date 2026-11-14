import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiProxyTarget =
  process.env.API_PROXY_TARGET || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  typedRoutes: false,
  // Local creative analysis can include video extraction before the model responds.
  experimental: process.env.NEXT_PUBLIC_TMX_LOCAL_PREVIEW_KIND === 'synthetic'
    ? { proxyTimeout: 600_000 }
    : {},
  distDir:
    process.env.NEXT_DIST_DIR ??
    (process.env.NODE_ENV === 'production' ? '.next-build' : '.next-dev'),
  transpilePackages: ['@page-cloner/shared'],
  // Standalone output for slim production Docker images.
  output: 'standalone',
  // Tell Next.js to trace deps from the monorepo root, not just packages/web.
  outputFileTracingRoot: path.join(__dirname, '../../'),
  async redirects() {
    // The isolated API permits localhost:3120; keep preview browser origins canonical.
    return process.env.NEXT_PUBLIC_TMX_LOCAL_PREVIEW_KIND === 'synthetic'
      ? [
          {
            source: '/:path*',
            has: [{ type: 'host', value: '127\\.0\\.0\\.1' }],
            destination: 'http://localhost:3120/:path*',
            permanent: false,
          },
        ]
      : [];
  },
  async rewrites() {
    return [
      {
        source: '/v1/:path*',
        destination: `${apiProxyTarget.replace(/\/$/, '')}/v1/:path*`,
      },
    ];
  },
  webpack: (config) => {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
};

export default nextConfig;
