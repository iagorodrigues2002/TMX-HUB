#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import process from 'node:process';
import Redis from 'ioredis';
import postgres from 'postgres';
import { ulid } from 'ulid';

const DEFAULT_LOCAL_DB = 'postgresql://postgres:postgres@127.0.0.1:5432/tmx_hub_dev';
const DEFAULT_LOCAL_REDIS = 'redis://127.0.0.1:6379';
const DEFAULT_DEV_EMAIL = 'dev@tmx.local';
const SECRET_FAKE = 'scrubbed-secret-dev-only';

function parseArgs(argv) {
  const options = {
    offerId: '',
    offerName: '',
    days: 30,
    scrubMode: 'strict',
    devEmail: DEFAULT_DEV_EMAIL,
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const [key, inline] = arg.split('=', 2);
    const value = inline ?? argv[i + 1];
    if (key === '--offer-id') options.offerId = value ?? '';
    else if (key === '--offer-name') options.offerName = value ?? '';
    else if (key === '--days') options.days = Number(value);
    else if (key === '--scrub-mode') options.scrubMode = value ?? '';
    else if (key === '--dev-email') options.devEmail = value ?? '';
    else if (key === '--dry-run') options.dryRun = true;
    else if (key === '--help') {
      console.log(
        'Uso: node packages/api/scripts/import-pjr-eng.mjs --offer-id <ULID> [--days 30] [--scrub-mode strict] [--dev-email dev@tmx.local] [--dry-run]',
      );
      process.exit(0);
    } else {
      throw new Error(`Argumento desconhecido: ${arg}`);
    }
    if (
      inline === undefined &&
      ['--offer-id', '--offer-name', '--days', '--scrub-mode', '--dev-email'].includes(key)
    )
      i += 1;
  }
  if (!options.offerId && !options.offerName) {
    throw new Error('Informe --offer-id ou --offer-name.');
  }
  if (!Number.isInteger(options.days) || options.days < 1 || options.days > 365) {
    throw new Error('--days deve ser um inteiro entre 1 e 365.');
  }
  if (options.scrubMode !== 'strict') {
    throw new Error(
      'Somente --scrub-mode strict é permitido para impedir import sem anonimização.',
    );
  }
  return options;
}

function railwayVariables(service) {
  const raw = execFileSync('railway', ['variables', '--service', service, '--json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return JSON.parse(raw);
}

function resolveProductionUrls() {
  let databaseUrl = process.env.PROD_DATABASE_URL;
  let redisUrl = process.env.PROD_REDIS_URL;
  if (!databaseUrl) {
    const variables = railwayVariables('Postgres');
    databaseUrl = variables.DATABASE_PUBLIC_URL || variables.DATABASE_URL;
  }
  if (!redisUrl) {
    const variables = railwayVariables('Redis');
    redisUrl = variables.REDIS_PUBLIC_URL || variables.REDIS_URL;
  }
  if (!databaseUrl || !redisUrl) {
    throw new Error(
      'Credenciais de produção indisponíveis. Use PROD_DATABASE_URL/PROD_REDIS_URL ou autentique o Railway CLI.',
    );
  }
  return { databaseUrl, redisUrl };
}

function redisClient(url) {
  return new Redis(url, {
    lazyConnect: true,
    connectTimeout: 15_000,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  });
}

async function findOffer(redis, { offerId, offerName }) {
  if (offerId) {
    const offer = await redis.hgetall(`offer:${offerId}`);
    if (!offer.id) throw new Error(`Oferta ${offerId} não encontrada no Redis de produção.`);
    return offer;
  }
  const wanted = offerName.trim().toLowerCase();
  let cursor = '0';
  const matches = [];
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', 'offer:*', 'COUNT', 200);
    cursor = next;
    if (!keys.length) continue;
    const pipeline = redis.pipeline();
    for (const key of keys) pipeline.hgetall(key);
    for (const [, value] of (await pipeline.exec()) ?? []) {
      if (value?.id && value.name?.trim().toLowerCase() === wanted) matches.push(value);
    }
  } while (cursor !== '0');
  if (matches.length !== 1) {
    throw new Error(
      `Esperava uma oferta com nome exato ${offerName}; encontradas: ${matches.length}.`,
    );
  }
  return matches[0];
}

async function databaseSchema(sql) {
  const [columns, primaryKeys, foreignKeys] = await Promise.all([
    sql`
      SELECT table_name, column_name, data_type, ordinal_position
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position
    `,
    sql`
      SELECT tc.table_name, kcu.column_name, kcu.ordinal_position
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_name = tc.constraint_name
       AND kcu.constraint_schema = tc.constraint_schema
      WHERE tc.table_schema = 'public' AND tc.constraint_type = 'PRIMARY KEY'
      ORDER BY tc.table_name, kcu.ordinal_position
    `,
    sql`
      SELECT tc.table_name child_table, kcu.column_name child_column,
             ccu.table_name parent_table, ccu.column_name parent_column
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_name = tc.constraint_name
       AND kcu.constraint_schema = tc.constraint_schema
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
       AND ccu.constraint_schema = tc.constraint_schema
      WHERE tc.table_schema = 'public' AND tc.constraint_type = 'FOREIGN KEY'
      ORDER BY tc.table_name, kcu.ordinal_position
    `,
  ]);
  const tables = new Map();
  for (const column of columns) {
    const table = tables.get(column.table_name) ?? {
      columns: [],
      types: new Map(),
      primaryKey: [],
    };
    table.columns.push(column.column_name);
    table.types.set(column.column_name, column.data_type);
    tables.set(column.table_name, table);
  }
  for (const key of primaryKeys) tables.get(key.table_name)?.primaryKey.push(key.column_name);
  return { tables, foreignKeys };
}

const WINDOW_COLUMNS = {
  tracking_ab_assignments: ['created_at'],
  tracking_visitors: ['last_seen_at'],
  tracking_sessions: ['last_seen_at', 'started_at'],
  tracking_events: ['received_at', 'client_at'],
  tracking_orders: [
    'occurred_at',
    'paid_at',
    'updated_at',
    'cancelled_at',
    'refunded_at',
    'chargeback_at',
  ],
  tracking_gateway_webhook_receipts: ['received_at', 'processed_at'],
  meta_deliveries: ['created_at', 'event_at', 'delivered_at'],
  tracking_delivery_outbox: ['created_at', 'delivered_at'],
  tracking_tiktok_deliveries: ['created_at', 'delivered_at'],
  tracking_utmify_web_events: ['created_at', 'delivered_at'],
  vturb_deliveries: ['created_at', 'delivered_at'],
  webhook_receipts: ['received_at', 'processed_at'],
  recovery_email_dispatches: ['created_at', 'sent_at'],
  recovery_message_events: ['created_at'],
  recovery_messages: [
    'created_at',
    'sent_at',
    'delivered_at',
    'opened_at',
    'clicked_at',
    'bounced_at',
  ],
  recovery_opportunities: ['created_at', 'updated_at'],
  recovery_test_events: ['created_at'],
  recovery_test_runs: ['created_at'],
};

// Some bridge/activity tables can be reached through more than one FK. Only
// the parent that establishes ownership by this offer may seed the child;
// otherwise a shared visitor/order identifier can pull rows from another
// project into the export.
const CANONICAL_PARENT = {
  meta_pixel_products: ['meta_pixels'],
  recovery_message_events: ['recovery_messages'],
  recovery_messages: ['recovery_opportunities'],
  recovery_test_events: ['recovery_test_runs'],
  tracking_ab_assignments: ['tracking_ab_tests'],
  tracking_ab_variants: ['tracking_ab_tests'],
  tracking_gateway_webhook_receipts: ['tracking_gateway_connections'],
  tracking_google_ads_credentials: ['tracking_google_ads_destinations'],
  tracking_google_ads_oauth_states: ['tracking_google_ads_destinations'],
  webhook_receipts: ['vendepay_connections'],
};

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function timePredicate(tableName, table, since, parameters) {
  if (tableName.startsWith('tracking_upsell_')) return '';
  const configured = WINDOW_COLUMNS[tableName];
  if (!configured) return '';
  const columns = configured.filter((column) => table.columns.includes(column));
  if (!columns.length) return '';
  parameters.push(since);
  const placeholder = `$${parameters.length}`;
  return `(${columns.map((column) => `${quoteIdentifier(column)} >= ${placeholder}`).join(' OR ')})`;
}

async function selectRows(sql, tableName, table, predicates, parameters, since) {
  const time = timePredicate(tableName, table, since, parameters);
  const all = [...predicates, ...(time ? [time] : [])];
  if (!all.length) return [];
  return sql.unsafe(
    `SELECT * FROM ${quoteIdentifier(tableName)} WHERE ${all.map((part) => `(${part})`).join(' AND ')}`,
    parameters,
  );
}

function rowKey(table, row) {
  const columns = table.primaryKey.length ? table.primaryKey : table.columns;
  return columns.map((column) => JSON.stringify(row[column])).join('|');
}

async function collectRows(prod, schema, offerId, projectId, since) {
  const selected = new Map();
  const directSelections = [...schema.tables].map(async ([tableName, table]) => {
    const predicates = [];
    const parameters = [];
    if (tableName === 'tracking_projects') {
      parameters.push(projectId);
      predicates.push(`${quoteIdentifier('id')} = $${parameters.length}`);
    } else {
      if (table.columns.includes('project_id')) {
        parameters.push(projectId);
        predicates.push(`${quoteIdentifier('project_id')} = $${parameters.length}`);
      }
      if (table.columns.includes('offer_id')) {
        parameters.push(offerId);
        const offerPredicate = `${quoteIdentifier('offer_id')} = $${parameters.length}`;
        if (predicates.length) predicates[0] = `(${predicates[0]} OR ${offerPredicate})`;
        else predicates.push(offerPredicate);
      }
    }
    const rows = await selectRows(prod, tableName, table, predicates, parameters, since);
    return [tableName, rows];
  });
  for (const [tableName, rows] of await Promise.all(directSelections)) {
    if (rows.length) selected.set(tableName, rows);
  }

  const processedParentValues = new Map();
  let changed = true;
  while (changed) {
    changed = false;
    for (const relation of schema.foreignKeys) {
      const parentRows = selected.get(relation.parent_table);
      const child = schema.tables.get(relation.child_table);
      if (!parentRows?.length || !child) continue;
      const canonicalParents = CANONICAL_PARENT[relation.child_table];
      if (canonicalParents && !canonicalParents.includes(relation.parent_table)) continue;
      // A project/offer-scoped child was already fetched completely by the
      // direct pass above. Following the FK back into it would download large
      // event/session tables a second time.
      if (child.columns.includes('project_id') || child.columns.includes('offer_id')) continue;
      const relationKey = `${relation.child_table}.${relation.child_column}->${relation.parent_table}.${relation.parent_column}`;
      const processed = processedParentValues.get(relationKey) ?? new Set();
      const values = [
        ...new Set(
          parentRows.map((row) => row[relation.parent_column]).filter((value) => value != null),
        ),
      ].filter((value) => !processed.has(String(value)));
      if (!values.length) continue;
      for (const value of values) processed.add(String(value));
      processedParentValues.set(relationKey, processed);
      const parameters = [values];
      const rows = await selectRows(
        prod,
        relation.child_table,
        child,
        [`${quoteIdentifier(relation.child_column)} = ANY($1)`],
        parameters,
        since,
      );
      if (!rows.length) continue;
      const current = selected.get(relation.child_table) ?? [];
      const seen = new Set(current.map((row) => rowKey(child, row)));
      for (const row of rows) {
        const key = rowKey(child, row);
        if (seen.has(key)) continue;
        current.push(row);
        seen.add(key);
        changed = true;
      }
      selected.set(relation.child_table, current);
    }
  }

  // Add unscoped/static parents needed by selected rows (for example a Google
  // OAuth connection referenced by a project destination). Activity or
  // project-scoped parents are never widened beyond the requested window.
  changed = true;
  while (changed) {
    changed = false;
    for (const relation of schema.foreignKeys) {
      const childRows = selected.get(relation.child_table);
      const parent = schema.tables.get(relation.parent_table);
      if (!childRows?.length || !parent) continue;
      if (
        parent.columns.includes('project_id') ||
        parent.columns.includes('offer_id') ||
        WINDOW_COLUMNS[relation.parent_table]
      ) {
        continue;
      }
      const existing = new Set(
        (selected.get(relation.parent_table) ?? []).map((row) =>
          String(row[relation.parent_column]),
        ),
      );
      const missing = [
        ...new Set(
          childRows
            .map((row) => row[relation.child_column])
            .filter((value) => value != null && !existing.has(String(value))),
        ),
      ];
      if (!missing.length) continue;
      const rows = await prod.unsafe(
        `SELECT * FROM ${quoteIdentifier(relation.parent_table)} WHERE ${quoteIdentifier(relation.parent_column)} = ANY($1)`,
        [missing],
      );
      if (!rows.length) continue;
      const current = selected.get(relation.parent_table) ?? [];
      const seen = new Set(current.map((row) => rowKey(parent, row)));
      for (const row of rows) {
        const key = rowKey(parent, row);
        if (seen.has(key)) continue;
        current.push(row);
        seen.add(key);
        changed = true;
      }
      selected.set(relation.parent_table, current);
    }
  }

  // Keep the local subset referentially coherent. If a selected activity row
  // points to a project-scoped parent outside the window, omit that child
  // instead of importing an orphan or widening the requested date range.
  changed = true;
  while (changed) {
    changed = false;
    for (const relation of schema.foreignKeys) {
      const childRows = selected.get(relation.child_table);
      if (!childRows?.length) continue;
      const parentValues = new Set(
        (selected.get(relation.parent_table) ?? []).map((row) =>
          String(row[relation.parent_column]),
        ),
      );
      const kept = childRows.filter((row) => {
        const value = row[relation.child_column];
        return value == null || parentValues.has(String(value));
      });
      if (kept.length === childRows.length) continue;
      changed = true;
      if (kept.length) selected.set(relation.child_table, kept);
      else selected.delete(relation.child_table);
    }
  }
  return selected;
}

function createScrubber() {
  const emails = new Map();
  const hashes = new Map();
  let nextEmail = 1;
  let nextHash = 1;

  const normalizedKey = (key) =>
    String(key ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  const fakeEmail = (value) => {
    const key = String(value ?? '').toLowerCase();
    if (!emails.has(key)) emails.set(key, `buyer-${nextEmail++}@test.local`);
    return emails.get(key);
  };
  const fakeHash = (value, salt) => {
    const key = `${salt}:${String(value ?? '')}`;
    if (!hashes.has(key)) {
      hashes.set(key, createHash('sha256').update(`dev-local-fake-${nextHash++}`).digest('hex'));
    }
    return hashes.get(key);
  };

  function scrub(value, key = '', depth = 0, salt = '') {
    if (value == null || value instanceof Date) return value;
    if (Buffer.isBuffer(value)) return Buffer.from(SECRET_FAKE);
    if (Array.isArray(value)) return value.map((item) => scrub(item, key, depth + 1, salt));
    if (typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([childKey, childValue]) => [
          childKey,
          scrub(childValue, childKey, depth + 1, salt),
        ]),
      );
    }

    const field = normalizedKey(key);
    if (field.includes('hash')) return fakeHash(value, salt);
    if (
      /(token|secret|password|credential|authorization|apikey|accesskey|privatekey|verifier|encrypted)/.test(
        field,
      )
    ) {
      return SECRET_FAKE;
    }
    if (
      field === 'email' ||
      field.endsWith('email') ||
      field.includes('emailaddress') ||
      field.includes('customeremail') ||
      field.includes('buyeremail')
    )
      return fakeEmail(value);
    if (
      /(customername|buyername|fullname|firstname|lastname|nome)/.test(field) ||
      (field === 'name' && depth >= 1)
    ) {
      return `Teste Silva ${nextEmail}`;
    }
    if (
      /^(phone|telefone|mobile|whatsapp|celular)$/.test(field) ||
      /(customer|buyer|client)(phone|telefone|mobile|whatsapp|celular)$/.test(field)
    )
      return '11999999999';
    if (field.includes('cnpj')) return '00.000.000/0001-00';
    if (/(cpf|document|documento|taxid)/.test(field)) return '000.000.000-00';
    if (/(address|endereco|logradouro|street)/.test(field)) return 'Rua Teste, 100';
    if (field === 'ip' || field.endsWith('ip') || field.includes('ipaddress')) return '127.0.0.1';
    if (field.includes('useragent')) return 'Mozilla/5.0 (DevLocalScrub)';

    if (typeof value !== 'string') return value;
    let result = value;
    result = result.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, (match) => fakeEmail(match));
    result = result.replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, '000.000.000-00');
    result = result.replace(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g, '00.000.000/0001-00');
    result = result.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '127.0.0.1');
    result = result.replace(/\+?\d{1,3}\s*\(\d{2}\)\s*\d{4,5}-?\d{4}/g, '11999999999');
    return result;
  }

  return { scrub };
}

function remapRows(selected, schema, mapping, scrubber) {
  const output = new Map();
  for (const [tableName, rows] of selected) {
    const table = schema.tables.get(tableName);
    output.set(
      tableName,
      rows.map((source) => {
        const row = {};
        for (const column of table.columns) {
          if (!(column in source)) continue;
          let value = source[column];
          if (column === 'offer_id' && value === mapping.sourceOfferId)
            value = mapping.targetOfferId;
          if (column === 'project_id' && value === mapping.sourceProjectId)
            value = mapping.targetProjectId;
          if (
            tableName === 'tracking_projects' &&
            column === 'id' &&
            value === mapping.sourceProjectId
          ) {
            value = mapping.targetProjectId;
          }
          row[column] = scrubber.scrub(value, column, 0, `${tableName}:${rowKey(table, source)}`);
        }
        return row;
      }),
    );
  }
  return output;
}

async function insertRows(local, localSchema, selected) {
  const counts = {};
  await local.begin(async (tx) => {
    await tx.unsafe('SET LOCAL session_replication_role = replica');
    for (const [tableName, rows] of selected) {
      const table = localSchema.tables.get(tableName);
      if (!table || !rows.length) continue;
      const columns = table.columns.filter((column) => column in rows[0]);
      const updateColumns = columns.filter((column) => !table.primaryKey.includes(column));
      for (let offset = 0; offset < rows.length; offset += 250) {
        const batch = rows.slice(offset, offset + 250);
        const values = [];
        const tuples = batch.map((row) => {
          const placeholders = columns.map((column) => {
            const type = table.types.get(column);
            const value = row[column];
            // postgres.js serializes objects for json/jsonb parameters. Passing
            // JSON.stringify(value) here would encode the document twice and
            // store a JSON string instead of the original object/array.
            values.push(value);
            const cast = type === 'json' || type === 'jsonb' ? `::${type}` : '';
            return `$${values.length}${cast}`;
          });
          return `(${placeholders.join(',')})`;
        });
        let conflict = 'ON CONFLICT DO NOTHING';
        if (table.primaryKey.length && updateColumns.length) {
          conflict = `ON CONFLICT (${table.primaryKey.map(quoteIdentifier).join(',')}) DO UPDATE SET ${updateColumns
            .map((column) => `${quoteIdentifier(column)} = EXCLUDED.${quoteIdentifier(column)}`)
            .join(',')}`;
        }
        try {
          await tx.unsafe(
            `INSERT INTO ${quoteIdentifier(tableName)} (${columns.map(quoteIdentifier).join(',')}) VALUES ${tuples.join(',')} ${conflict}`,
            values,
          );
        } catch (error) {
          throw new Error(
            `Falha inserindo ${tableName}: ${error instanceof Error ? error.message : 'erro desconhecido'}`,
          );
        }
      }
      counts[tableName] = rows.length;
    }
  });
  return counts;
}

function safeOfferHash(prodOffer, targetOfferId, devUserId, scrubber) {
  const fields = [
    'name',
    'companyName',
    'dashboardId',
    'description',
    'status',
    'createdAt',
    'updatedAt',
    'currency',
  ];
  const result = { id: targetOfferId, userId: devUserId };
  for (const field of fields) {
    if (prodOffer[field]) result[field] = String(scrubber.scrub(prodOffer[field], field, 0));
  }
  result.memberIds = JSON.stringify([]);
  result.utmifyConfigured = 'false';
  return result;
}

async function verifyAntiPii(local, projectId) {
  const [counts, samples, leaks] = await Promise.all([
    local`
      SELECT
        (SELECT count(*)::int FROM tracking_events WHERE project_id = ${projectId}) events,
        (SELECT count(*)::int FROM tracking_orders WHERE project_id = ${projectId}) orders,
        (SELECT count(*)::int FROM tracking_visitors WHERE project_id = ${projectId}) visitors
    `,
    local`
      SELECT buyer->>'email' email, buyer->>'name' name, buyer->>'phone' phone
      FROM tracking_orders WHERE project_id = ${projectId}
      ORDER BY occurred_at DESC LIMIT 5
    `,
    local`
      SELECT count(*)::int leaks FROM tracking_orders
      WHERE project_id = ${projectId}
        AND (
          coalesce(buyer->>'email', '') <> '' AND coalesce(buyer->>'email', '') !~ '^buyer-[0-9]+@test\\.local$'
          OR coalesce(buyer->>'phone', '') <> '' AND buyer->>'phone' <> '11999999999'
          OR coalesce(buyer->>'name', '') <> '' AND buyer->>'name' !~ '^Teste Silva [0-9]+$'
        )
    `,
  ]);
  if ((leaks[0]?.leaks ?? 0) !== 0)
    throw new Error('Verificação anti-PII falhou em tracking_orders.');
  return { counts: counts[0], samples };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { databaseUrl, redisUrl } = resolveProductionUrls();
  const localDatabaseUrl = process.env.LOCAL_DATABASE_URL || DEFAULT_LOCAL_DB;
  const localRedisUrl = process.env.LOCAL_REDIS_URL || DEFAULT_LOCAL_REDIS;
  const prod = postgres(databaseUrl, {
    max: 6,
    ssl: databaseUrl.includes('railway.app') ? 'require' : undefined,
  });
  const local = postgres(localDatabaseUrl, { max: 2 });
  const prodRedis = redisClient(redisUrl);
  const localRedis = redisClient(localRedisUrl);
  prodRedis.on('error', () => {});
  localRedis.on('error', () => {});

  try {
    await Promise.all([prodRedis.connect(), localRedis.connect()]);
    const prodOffer = await findOffer(prodRedis, options);
    const [project] = await prod`
      SELECT id, offer_id FROM tracking_projects
      WHERE offer_id = ${prodOffer.id}
      ORDER BY enabled DESC, created_at ASC LIMIT 1
    `;
    if (!project)
      throw new Error(`Projeto de tracking não encontrado para a oferta ${prodOffer.id}.`);

    const devUserId = await localRedis.get(`user-email:${options.devEmail.trim().toLowerCase()}`);
    if (!devUserId) throw new Error(`Usuário local ${options.devEmail} não encontrado.`);

    let targetOfferId = prodOffer.id;
    const localOffer = await localRedis.hgetall(`offer:${targetOfferId}`);
    if (localOffer.id && localOffer.name !== prodOffer.name) targetOfferId = ulid();

    let targetProjectId = project.id;
    const [localProject] =
      await local`SELECT id, offer_id FROM tracking_projects WHERE id = ${project.id}`;
    if (localProject && localProject.offer_id !== targetOfferId) targetProjectId = ulid();

    const since = new Date(Date.now() - options.days * 86_400_000);
    const [prodSchema, localSchema] = await Promise.all([
      databaseSchema(prod),
      databaseSchema(local),
    ]);
    const selected = await collectRows(prod, prodSchema, prodOffer.id, project.id, since);
    const scrubber = createScrubber();
    const scrubbed = remapRows(
      selected,
      prodSchema,
      {
        sourceOfferId: prodOffer.id,
        targetOfferId,
        sourceProjectId: project.id,
        targetProjectId,
      },
      scrubber,
    );

    const selectedCounts = Object.fromEntries(
      [...scrubbed].map(([table, rows]) => [table, rows.length]),
    );
    if (options.dryRun) {
      console.log(
        JSON.stringify(
          {
            mode: 'dry-run',
            offer_id: targetOfferId,
            project_id: targetProjectId,
            counts: selectedCounts,
          },
          null,
          2,
        ),
      );
      return;
    }

    const insertedCounts = await insertRows(local, localSchema, scrubbed);
    const offerHash = safeOfferHash(prodOffer, targetOfferId, devUserId, scrubber);
    await localRedis
      .multi()
      .del(`offer:${targetOfferId}`)
      .hset(`offer:${targetOfferId}`, offerHash)
      .sadd(`user-offers:${devUserId}`, targetOfferId)
      .exec();

    const verification = await verifyAntiPii(local, targetProjectId);
    console.log(
      JSON.stringify(
        {
          mode: 'import',
          offer_id: targetOfferId,
          project_id: targetProjectId,
          days: options.days,
          counts: insertedCounts,
          verification: {
            ...verification.counts,
            order_samples: verification.samples,
            dev_access: true,
            anti_pii_leaks: 0,
          },
        },
        null,
        2,
      ),
    );
  } finally {
    prodRedis.disconnect();
    localRedis.disconnect();
    await Promise.allSettled([prod.end({ timeout: 5 }), local.end({ timeout: 5 })]);
  }
}

main().catch((error) => {
  console.error(`Import falhou: ${error instanceof Error ? error.message : 'erro desconhecido'}`);
  process.exitCode = 1;
});
