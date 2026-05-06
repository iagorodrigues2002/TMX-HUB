import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { DigiAuditStore } from '../services/digi-audit-store.js';
import { FunnelJobStore } from '../services/funnel-job-store.js';
import { JobStore } from '../services/job-store.js';
import { NicheStore } from '../services/niche-store.js';
import { OfferStore } from '../services/offer-store.js';
import { ShieldJobStore } from '../services/shield-job-store.js';
import { SnapshotStore } from '../services/snapshot-store.js';
import { StorageService } from '../services/storage.js';
import { VslJobStore } from '../services/vsl-job-store.js';

declare module 'fastify' {
  interface FastifyInstance {
    storage: StorageService;
    jobStore: JobStore;
    vslJobStore: VslJobStore;
    funnelJobStore: FunnelJobStore;
    offerStore: OfferStore;
    snapshotStore: SnapshotStore;
    nicheStore: NicheStore;
    shieldJobStore: ShieldJobStore;
    digiAuditStore: DigiAuditStore;
  }
}

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  const storage = new StorageService();
  app.decorate('storage', storage);
  app.decorate('jobStore', new JobStore(app.redis, storage));
  app.decorate('vslJobStore', new VslJobStore(app.redis));
  app.decorate('funnelJobStore', new FunnelJobStore(app.redis));
  app.decorate('offerStore', new OfferStore(app.redis));
  app.decorate('snapshotStore', new SnapshotStore(app.redis));
  app.decorate('nicheStore', new NicheStore(app.redis));
  app.decorate('shieldJobStore', new ShieldJobStore(app.redis));
  app.decorate('digiAuditStore', new DigiAuditStore(app.redis));

  app.addHook('onClose', async () => {
    await storage.close();
  });
};

// Mark as encapsulation-bypassing so decorators are visible app-wide.
(plugin as unknown as Record<symbol, boolean>)[Symbol.for('skip-override')] = true;

export default plugin;
