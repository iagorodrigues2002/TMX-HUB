import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { env } from '../env.js';
import { DigiAuditStore } from '../services/digi-audit-store.js';
import { FunnelJobStore } from '../services/funnel-job-store.js';
import { InviteStore } from '../services/invite-store.js';
import { IntradayStore } from '../services/intraday-store.js';
import { JobStore } from '../services/job-store.js';
import { MediaJobStore } from '../services/media-job-store.js';
import { NicheStore } from '../services/niche-store.js';
import { OfferStore } from '../services/offer-store.js';
import { ShieldJobStore } from '../services/shield-job-store.js';
import { SnapshotStore } from '../services/snapshot-store.js';
import { StorageService } from '../services/storage.js';
import { UtmifySyncService } from '../services/utmify-sync.js';
import { VslJobStore } from '../services/vsl-job-store.js';

declare module 'fastify' {
  interface FastifyInstance {
    storage: StorageService;
    jobStore: JobStore;
    vslJobStore: VslJobStore;
    funnelJobStore: FunnelJobStore;
    offerStore: OfferStore;
    snapshotStore: SnapshotStore;
    intradayStore: IntradayStore;
    nicheStore: NicheStore;
    shieldJobStore: ShieldJobStore;
    mediaJobStore: MediaJobStore;
    digiAuditStore: DigiAuditStore;
    inviteStore: InviteStore;
    utmifySync: UtmifySyncService;
  }
}

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  const storage = new StorageService();
  app.decorate('storage', storage);
  app.decorate('jobStore', new JobStore(app.redis, storage));
  app.decorate('vslJobStore', new VslJobStore(app.redis));
  app.decorate('funnelJobStore', new FunnelJobStore(app.redis));
  app.decorate('offerStore', new OfferStore(app.redis, env.JWT_SECRET));
  app.decorate('snapshotStore', new SnapshotStore(app.redis));
  app.decorate('intradayStore', new IntradayStore(app.redis));
  app.decorate('nicheStore', new NicheStore(app.redis));
  app.decorate('shieldJobStore', new ShieldJobStore(app.redis));
  app.decorate('mediaJobStore', new MediaJobStore(app.redis));
  app.decorate('digiAuditStore', new DigiAuditStore(app.redis));
  app.decorate('inviteStore', new InviteStore(app.redis));
  app.decorate(
    'utmifySync',
    new UtmifySyncService(
      app.redis,
      app.offerStore,
      app.snapshotStore,
      app.intradayStore,
      app.log,
    ),
  );

  // Migração one-shot: nichos antigos viviam em user-niches:{userId}.
  // Agora todos compartilham niches:global. Flag em Redis previne re-execução.
  app.nicheStore
    .migrateToGlobalOnce()
    .then((r) => {
      if (!r.alreadyDone) {
        app.log.info({ migrated: r.migrated }, 'niches: migrated to global set');
      }
    })
    .catch((err) => app.log.warn({ err }, 'niches: migration failed (non-fatal)'));

  app.addHook('onClose', async () => {
    await storage.close();
  });
};

// Mark as encapsulation-bypassing so decorators are visible app-wide.
(plugin as unknown as Record<symbol, boolean>)[Symbol.for('skip-override')] = true;

export default plugin;
