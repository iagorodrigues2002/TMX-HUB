import { createHash, randomUUID } from 'node:crypto';
import { relative, resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { AiAccess } from './ai-preview-access.js';
import type { CreativePersistence } from './creative-learning.js';
import { cloudCreativeDriveState } from './creative-drive.js';

/** Company-scoped durable counterpart of the preview's JSON documents. */
export function creativePersistence(app: FastifyInstance, root: string, access: AiAccess): CreativePersistence {
  const sql = app.db!;
  const company = access.companyId;
  const owner = createHash('sha256').update(access.userId).digest('hex');
  const visualRecords = new Map<string, unknown>();
  const address = (file: string) => {
    const path = relative(resolve(root), resolve(file));
    if (path === `../creative-drive-preview/${owner}.catalog.json`) return 'drive/catalog';
    if (path === `../creative-drive-preview/${owner}.metadata.json`) return 'drive/metadata';
    for (const kind of ['creative-learning', 'spy-visual', 'spy-transcription', 'creative-media', 'spy-visual-source']) {
      const prefix = `${kind}/${company}/`;
      if (path.startsWith(prefix) && !path.slice(prefix.length).includes('..'))
        return `${kind}/${path.slice(prefix.length)}`;
    }
    throw Error('CREATIVE_STORAGE_SCOPE');
  };
  const store: CreativePersistence = {
    async read<T>(file: string, fallback: T): Promise<T> {
      const name = address(file);
      if (name.startsWith('drive/')) {
        const state = await cloudCreativeDriveState(app.redis, `company:${company}`);
        return (name === 'drive/catalog' ? { catalog: state.catalog } : state.metadata) as T;
      }
      const fingerprint = /^(spy-visual|spy-transcription)\/([a-f0-9]{64})\.json$/.exec(name);
      if (fingerprint) {
        if (fingerprint[1] === 'spy-visual' && visualRecords.has(fingerprint[2]!)) return visualRecords.get(fingerprint[2]!) as T;
        const rows = fingerprint[1] === 'spy-visual'
          ? await sql`SELECT record FROM company_spy_visual_analyses WHERE company_id=${company} AND fingerprint=${fingerprint[2]!}`
          : await sql`SELECT record FROM company_spy_transcriptions WHERE company_id=${company} AND fingerprint=${fingerprint[2]!}`;
        return rows[0]?.record ?? fallback;
      }
      return (await sql`SELECT document FROM company_creative_documents WHERE company_id=${company} AND name=${name}`)[0]?.document ?? fallback;
    },
    async save(file, value) {
      const name = address(file);
      if (!name.startsWith('creative-learning/') && !name.startsWith('creative-media/')) throw Error('CREATIVE_STORAGE_READ_ONLY');
      await sql`INSERT INTO company_creative_documents(company_id,name,document)
        VALUES(${company},${name},${sql.json(JSON.parse(JSON.stringify(value)))})
        ON CONFLICT(company_id,name) DO UPDATE SET document=excluded.document,updated_at=now()`;
    },
    async list(directory) {
      const name = address(`${directory}/index.json`).replace(/index\.json$/, '');
      if (name === 'spy-visual/') {
        return (await sql`SELECT fingerprint,record FROM company_spy_visual_analyses WHERE company_id=${company} AND record->>'status'='complete'`).map(r => { if(r.record)visualRecords.set(r.fingerprint,r.record);return `${r.fingerprint}.json`; });
      }
      return (await sql`SELECT name FROM company_creative_documents WHERE company_id=${company} AND starts_with(name,${name})`)
        .map(r => String(r.name).slice(name.length)).filter(n => !n.includes('/'));
    },
    async serial<T>(file: string, work: () => Promise<T>) {
      const name = address(file), token = randomUUID();
      const key = `creative-learning:lock:${company}:${name}`;
      let acquired = false;
      for (let i = 0; i < 30; i++) {
        if (await app.redis.set(key, token, 'PX', 30000, 'NX')) { acquired = true; break; }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      if (!acquired) throw Error('CREATIVE_STORAGE_BUSY');
      try { return await work(); }
      finally { await app.redis.eval("if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end", 1, key, token); }
    },
  };
  return store;
}
