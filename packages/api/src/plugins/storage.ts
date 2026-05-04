import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { JobStore } from '../services/job-store.js';
import { StorageService } from '../services/storage.js';
import { VslJobStore } from '../services/vsl-job-store.js';

declare module 'fastify' {
  interface FastifyInstance {
    storage: StorageService;
    jobStore: JobStore;
    vslJobStore: VslJobStore;
  }
}

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  const storage = new StorageService();
  app.decorate('storage', storage);
  app.decorate('jobStore', new JobStore(app.redis, storage));
  app.decorate('vslJobStore', new VslJobStore(app.redis));

  app.addHook('onClose', async () => {
    await storage.close();
  });
};

// Mark as encapsulation-bypassing so decorators are visible app-wide.
(plugin as unknown as Record<symbol, boolean>)[Symbol.for('skip-override')] = true;

export default plugin;
