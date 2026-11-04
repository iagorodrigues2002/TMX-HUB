import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

/** Frontend isolado: sem providers de autenticação, proxy de API ou arquivos .env. */
export default {
  devIndicators: false,
  distDir: process.env.NEXT_REFERENCE_DIST_DIR || '.next-reference',
  experimental: { externalDir: true },
  webpack(config) {
    config.resolve.alias['@'] = path.resolve(root, '../../packages/web/src');
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
};
