import assert from 'node:assert/strict';
import test from 'node:test';
import { assertLiveBaseline, previewEnvironment } from '../../../scripts/local-members-preview.mjs';

const head = 'a'.repeat(40);
const status = () => ({
  id: '3704cd93-6011-4e5f-be52-f229b499b018',
  environments: {
    edges: [
      {
        node: {
          name: 'production',
          serviceInstances: {
            edges: ['@page-cloner/web', '@page-cloner/api'].map((serviceName) => ({
              node: {
                serviceName,
                activeDeployments: [{ status: 'SUCCESS', meta: { commitHash: head } }],
              },
            })),
          },
        },
      },
    ],
  },
});

test('prévia exige o projeto e a mesma base publicada nos dois serviços', () => {
  assert.doesNotThrow(() => assertLiveBaseline(status(), head));
  assert.throws(() => assertLiveBaseline(status(), 'b'.repeat(40)), /diferente do live/);
  assert.throws(() => assertLiveBaseline({ ...status(), id: 'other' }, head), /inválida/);
  const changed = status();
  changed.environments.edges[0].node.serviceInstances.edges[1].node.activeDeployments[0].meta.commitHash =
    'b'.repeat(40);
  assert.throws(() => assertLiveBaseline(changed, head), /diferente do live/);
});

test('prévia não inicia durante deploy ambíguo ou malsucedido', () => {
  const changed = status();
  const deployments =
    changed.environments.edges[0].node.serviceInstances.edges[0].node.activeDeployments;
  deployments[0].status = 'FAILED';
  assert.throws(() => assertLiveBaseline(changed, head), /não está estável/);
  deployments[0].status = 'SUCCESS';
  deployments.push(deployments[0]);
  assert.throws(() => assertLiveBaseline(changed, head), /não está estável/);
});

test('prévia mantém API isolada e copia somente a configuração visual pública', () => {
  assert.deepEqual(previewEnvironment(head, '1'), {
    NODE_ENV: 'development',
    NEXT_DIST_DIR: '.next-native-preview',
    API_PROXY_TARGET: 'http://127.0.0.1:4110',
    NEXT_PUBLIC_API_URL: 'http://localhost:3120',
    NEXT_PUBLIC_TMX_SIGNAL_PREVIEW: '1',
    NEXT_PUBLIC_TMX_LOCAL_PREVIEW_KIND: 'synthetic',
    NEXT_PUBLIC_TMX_LOCAL_BASE: 'aaaaaaa',
  });
  assert.throws(() => previewEnvironment(head, undefined), /não identificada/);
});

test('prévia compilada elimina compilação por navegação sem mudar API ou escopo dos dados', () => {
  const env = previewEnvironment(head, '1', true);
  assert.equal(env.NODE_ENV, 'production');
  assert.equal(env.NEXT_DIST_DIR, '.next-native-compiled');
  assert.equal(env.API_PROXY_TARGET, 'http://127.0.0.1:4110');
  assert.equal(env.NEXT_PUBLIC_API_URL, 'http://localhost:3120');
  assert.equal(env.NEXT_PUBLIC_TMX_LOCAL_PREVIEW_KIND, 'synthetic');
  assert.equal(env.NEXT_PUBLIC_TMX_LOCAL_BASE, 'aaaaaaa');
  assert.equal(env.NEXT_PUBLIC_TMX_SIGNAL_PREVIEW, '1');
});
