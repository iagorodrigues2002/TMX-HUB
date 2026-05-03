import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import jsYaml from 'js-yaml';

const here = dirname(fileURLToPath(import.meta.url));

// In dev (tsx) we live at packages/api/src/plugins; in prod we live at
// packages/api/dist/plugins. The yaml is at <repo>/docs/openapi.yaml in
// either case — three levels up.
const candidatePaths = [
  resolve(here, '../../../../docs/openapi.yaml'),
  resolve(here, '../../../docs/openapi.yaml'),
  resolve(process.cwd(), 'docs/openapi.yaml'),
  resolve(process.cwd(), '../../docs/openapi.yaml'),
];

async function loadSpec(): Promise<Record<string, unknown> | null> {
  for (const p of candidatePaths) {
    try {
      const raw = await readFile(p, 'utf-8');
      return jsYaml.load(raw) as Record<string, unknown>;
    } catch {
      // try next
    }
  }
  return null;
}

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  const spec = await loadSpec();
  if (!spec) {
    app.log.warn('OpenAPI spec not found; /docs will be unavailable.');
    return;
  }

  await app.register(swagger, {
    mode: 'static',
    specification: { document: spec as never },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list', deepLinking: true },
  });
};

export default plugin;
