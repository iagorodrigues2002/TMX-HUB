import { driveFolderId } from '@page-cloner/shared/creative-drive-reader';
import {
  applyCreativeStatuses,
  applyManualCreativeMetadata,
  creativeDriveAction,
} from '@page-cloner/shared/creative-drive-state';
import { CREATIVE_HISTORY_START } from '@page-cloner/shared/creative-identity';
import {
  creativeDeliveryAssessment,
  hasCreativeDeliveryCoverage,
} from '@page-cloner/shared/creative-workspace-model';
import { todayIso } from '@page-cloner/shared/date-range';
import type { RealCampaignSnapshot } from '@page-cloner/shared/traffic-campaigns-model';
import type { FastifyInstance } from 'fastify';
import { env } from '../../env.js';
import {
  cloudCreativeDriveState,
  configureCloudCreativeDrive,
  startCreativeDriveSync,
  updateCloudCreativeMetadata,
} from '../../services/creative-drive.js';
import { trafficUserKey } from '../../services/traffic-personal-sync.js';
import { serverTrafficSnapshot } from '../../services/traffic-server-cache.js';
import { assertAdmin } from '../meta-control/connection-schema.js';

const path = '/ads-intelligence/creative-drive';

export function registerCreativeDriveRoutes(app: FastifyInstance) {
  if (env.NODE_ENV === 'production') startCreativeDriveSync(app);
  app.get(path, async (req, reply) => {
    assertAdmin(req);
    reply.header('Cache-Control', 'private, no-store');
    return cloudCreativeDriveState(app.redis, req.user!.sub);
  });
  app.post(path, { bodyLimit: 65_536 }, async (req, reply) => {
    assertAdmin(req);
    reply.header('Cache-Control', 'private, no-store');
    const owner = req.user!.sub;
    const parsed = creativeDriveAction.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ detail: 'Confira os dados enviados.' });
    const input = parsed.data;
    if (input.action === 'classify') {
      const range = { from: CREATIVE_HISTORY_START, to: todayIso() };
      const prefix = trafficUserKey(owner);
      const connection = await app.redis.get(prefix + 'connection');
      let snapshot: RealCampaignSnapshot | null = null;
      if (connection) {
        const { revision } = JSON.parse(connection);
        const raw = await app.redis.get(`${prefix}${revision}:${range.from}:${range.to}`);
        if (raw) snapshot = JSON.parse(raw);
      } else {
        snapshot = (await serverTrafficSnapshot(app.redis, owner, range.from, range.to))?.snapshot ?? null;
      }
      if (!snapshot || !hasCreativeDeliveryCoverage(snapshot, range))
        return reply.code(409).send({ detail: 'Aguardando os dados completos para atualizar os alertas.' });
      const report = snapshot;
      return updateCloudCreativeMetadata(app.redis, owner, (state) => {
        const assessment = creativeDeliveryAssessment(report, range, state, input.mappings);
        return {
          metadata: applyCreativeStatuses(state.metadata, assessment.statuses),
          result: { lowRoas: assessment.lowRoas },
        };
      });
    }
    if (input.action === 'metadata') {
      try {
        await updateCloudCreativeMetadata(app.redis, owner, (state) => ({
          metadata: applyManualCreativeMetadata(state, input.key, {
            ...(input.status !== undefined ? { status: input.status } : {}),
            ...(input.principalId ? { principalId: input.principalId } : {}),
          }),
          result: undefined,
        }));
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'Não foi possível salvar o criativo.';
        if (/^(Criativo ou status inválido|O arquivo principal precisa pertencer)/.test(detail))
          return reply.code(400).send({ detail });
        throw error;
      }
    } else {
      const rootUrl = input.action === 'configure'
        ? input.rootUrl
        : (await cloudCreativeDriveState(app.redis, owner)).rootUrl;
      let rootId: string;
      try {
        rootId = driveFolderId(rootUrl);
      } catch {
        return reply.code(400).send({ detail: 'Use um link válido de pasta do Google Drive.' });
      }
      await configureCloudCreativeDrive(app.redis, owner, `https://drive.google.com/drive/folders/${rootId}`);
    }
    return cloudCreativeDriveState(app.redis, owner);
  });
}
