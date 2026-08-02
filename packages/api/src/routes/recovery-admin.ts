import { createHash, randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { ulid } from 'ulid';
import { z } from 'zod';
import { env } from '../env.js';
import { NotFoundError, zodToProblem } from '../lib/problem.js';
import { decryptSecret, encryptSecret } from '../lib/secret-box.js';

const SettingsSchema = z.object({
  checkout_url: z.string().url().max(4096),
  sender_name: z.string().trim().min(2).max(80).default('TMX'),
  quiet_start: z.coerce.number().int().min(0).max(23).default(21),
  quiet_end: z.coerce.number().int().min(0).max(23).default(8),
  enabled: z.boolean().default(true),
});
const ChannelSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('whatsapp'), enabled: z.boolean().default(true), credentials: z.object({ access_token: z.string().min(20), phone_number_id: z.string().min(5) }), config: z.object({ template_name: z.string().min(1), language: z.string().default('pt_BR') }) }),
  z.object({ kind: z.literal('sms'), enabled: z.boolean().default(true), credentials: z.object({ account_sid: z.string().min(10), auth_token: z.string().min(10), from_number: z.string().min(6) }), config: z.object({ message: z.string().min(10).max(1000) }) }),
  z.object({ kind: z.literal('email'), enabled: z.boolean().default(true), credentials: z.object({ api_key: z.string().min(10), from_email: z.string().email() }), config: z.object({ subject: z.string().min(3).max(200), message: z.string().min(10).max(5000) }) }),
]);
const SendSchema = z.object({ channel: z.enum(['whatsapp', 'sms', 'email']) });
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const mask = (value: string | null, kind: 'email' | 'phone') => {
  if (!value) return null;
  if (kind === 'email') { const [name, domain] = value.split('@'); return `${name?.slice(0, 2) ?? ''}***@${domain ?? ''}`; }
  return `***${value.replace(/\D/g, '').slice(-4)}`;
};

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  const projectFor = async (offerId: string) => {
    const [project] = await app.db!<{ id: string }[]>`SELECT id FROM tracking_projects WHERE offer_id=${offerId} AND enabled=true`;
    if (!project) throw new NotFoundError('Projeto de tracking não encontrado.');
    return project;
  };

  app.get<{ Params: { id: string } }>('/offers/:id/recovery', async (req, reply) => {
    await app.offerStore.assertAccess(req.params.id, req.user!.sub, req.user!.role === 'admin');
    if (!app.db) return reply.code(503).send({ error: 'database_unavailable' });
    const project = await projectFor(req.params.id);
    const [settings] = await app.db`SELECT checkout_url, sender_name, quiet_start, quiet_end, enabled FROM recovery_settings WHERE project_id=${project.id}`;
    const channels = await app.db<Array<{ id: string; kind: string; enabled: boolean; config: Record<string, unknown>; updated_at: Date }>>`
      SELECT id, kind, enabled, config, updated_at FROM recovery_channels WHERE project_id=${project.id} ORDER BY kind
    `;
    const opportunities = await app.db<Array<Record<string, unknown>>>`
      SELECT ro.id, ro.status, ro.reason, ro.buyer_name, ro.email, ro.phone, ro.created_at,
             ro.last_contact_at, ro.clicked_at, ro.recovered_at, o.external_id, o.amount_minor,
             o.amount_brl_minor, o.currency, o.product,
             (SELECT count(*)::int FROM recovery_messages rm WHERE rm.opportunity_id=ro.id) AS messages,
             (SELECT rm.state FROM recovery_messages rm WHERE rm.opportunity_id=ro.id ORDER BY rm.created_at DESC LIMIT 1) AS last_message_state
      FROM recovery_opportunities ro JOIN tracking_orders o ON o.id=ro.order_id
      WHERE ro.project_id=${project.id} ORDER BY ro.created_at DESC LIMIT 100
    `;
    const totals = await app.db<Array<{ eligible: number; contacted: number; clicked: number; recovered: number; recovered_minor: string }>>`
      SELECT count(*) FILTER (WHERE ro.status='eligible')::int AS eligible,
        count(*) FILTER (WHERE ro.status='contacted')::int AS contacted,
        count(*) FILTER (WHERE ro.clicked_at IS NOT NULL)::int AS clicked,
        count(*) FILTER (WHERE ro.status='recovered')::int AS recovered,
        COALESCE(sum(COALESCE(recovered.amount_brl_minor,o.amount_brl_minor)) FILTER (WHERE ro.status='recovered'),0)::text AS recovered_minor
      FROM recovery_opportunities ro JOIN tracking_orders o ON o.id=ro.order_id
      LEFT JOIN tracking_orders recovered ON recovered.id=ro.recovered_order_id
      WHERE ro.project_id=${project.id}
    `;
    return { settings: settings ?? null, channels: channels.map((c) => ({ ...c, configured: true })), totals: totals[0], opportunities: opportunities.map((o) => ({ ...o, email: mask(o.email as string | null, 'email'), phone: mask(o.phone as string | null, 'phone'), has_email: Boolean(o.email), has_phone: Boolean(o.phone) })) };
  });

  app.put<{ Params: { id: string }; Body: unknown }>('/offers/:id/recovery/settings', async (req, reply) => {
    await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
    if (!app.db) return reply.code(503).send();
    const parsed = SettingsSchema.safeParse(req.body); if (!parsed.success) throw zodToProblem(parsed.error);
    const project = await projectFor(req.params.id); const s = parsed.data;
    await app.db`INSERT INTO recovery_settings(project_id,checkout_url,sender_name,quiet_start,quiet_end,enabled) VALUES(${project.id},${s.checkout_url},${s.sender_name},${s.quiet_start},${s.quiet_end},${s.enabled}) ON CONFLICT(project_id) DO UPDATE SET checkout_url=EXCLUDED.checkout_url,sender_name=EXCLUDED.sender_name,quiet_start=EXCLUDED.quiet_start,quiet_end=EXCLUDED.quiet_end,enabled=EXCLUDED.enabled,updated_at=now()`;
    return { ok: true };
  });

  app.put<{ Params: { id: string }; Body: unknown }>('/offers/:id/recovery/channels', async (req, reply) => {
    await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
    if (!app.db || !env.TRACKING_ENCRYPTION_KEY) return reply.code(503).send({ error: 'encryption_unavailable' });
    const parsed = ChannelSchema.safeParse(req.body); if (!parsed.success) throw zodToProblem(parsed.error);
    const project = await projectFor(req.params.id); const value = parsed.data;
    await app.db`INSERT INTO recovery_channels(id,project_id,kind,credentials_encrypted,config,enabled) VALUES(${ulid()},${project.id},${value.kind},${encryptSecret(JSON.stringify(value.credentials),env.TRACKING_ENCRYPTION_KEY)},${app.db.json(value.config as never)},${value.enabled}) ON CONFLICT(project_id,kind) DO UPDATE SET credentials_encrypted=EXCLUDED.credentials_encrypted,config=EXCLUDED.config,enabled=EXCLUDED.enabled,updated_at=now()`;
    return { ok: true, kind: value.kind };
  });

  app.post<{ Params: { id: string } }>('/offers/:id/recovery/sync', async (req, reply) => {
    await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
    if (!app.db || !env.TRACKING_ENCRYPTION_KEY) return reply.code(503).send();
    const project = await projectFor(req.params.id);
    const [settings] = await app.db<{ checkout_url: string | null }[]>`SELECT checkout_url FROM recovery_settings WHERE project_id=${project.id} AND enabled=true`;
    if (!settings?.checkout_url) return reply.code(409).send({ error: 'recovery_checkout_url_missing', detail: 'Configure o checkout de recuperação primeiro.' });
    const candidates = await app.db<Array<{ id: string; visitor_id: string | null; buyer: { name?: string; email?: string; phone?: string }; status: string; attribution_source: Record<string,string> }>>`
      SELECT id, visitor_id, buyer, status, attribution_source FROM tracking_orders
      WHERE project_id=${project.id} AND status IN ('abandoned','refused','failed')
        AND updated_at >= now()-interval '30 days' AND (NULLIF(buyer->>'email','') IS NOT NULL OR NULLIF(buyer->>'phone','') IS NOT NULL)
    `;
    let created=0;
    for (const order of candidates) { const token=randomBytes(24).toString('base64url'); const rows=await app.db`
      INSERT INTO recovery_opportunities(id,project_id,order_id,visitor_id,buyer_name,email,phone,reason,recovery_token_hash,recovery_token_encrypted,destination_url,original_source)
      VALUES(${ulid()},${project.id},${order.id},${order.visitor_id},${order.buyer.name??null},${order.buyer.email??null},${order.buyer.phone??null},${order.status},${hash(token)},${encryptSecret(token,env.TRACKING_ENCRYPTION_KEY)},${settings.checkout_url},${app.db.json(order.attribution_source as never)})
      ON CONFLICT(project_id,order_id) DO NOTHING RETURNING id`; if(rows[0]) created++; }
    return reply.code(202).send({ accepted:true, candidates:candidates.length, created });
  });

  app.post<{ Params: { id: string; opportunityId: string }; Body: unknown }>('/offers/:id/recovery/opportunities/:opportunityId/send', async (req, reply) => {
    await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
    if (!app.db || !env.TRACKING_ENCRYPTION_KEY) return reply.code(503).send();
    const parsed=SendSchema.safeParse(req.body); if(!parsed.success) throw zodToProblem(parsed.error);
    const project=await projectFor(req.params.id);
    const [row]=await app.db<Array<{ opportunity_id:string; status:string; buyer_name:string|null; email:string|null; phone:string|null; recovery_token_encrypted:string; channel_id:string; credentials_encrypted:string; config:Record<string,string> }>>`
      SELECT ro.id AS opportunity_id,ro.status,ro.buyer_name,ro.email,ro.phone,ro.recovery_token_encrypted,rc.id AS channel_id,rc.credentials_encrypted,rc.config
      FROM recovery_opportunities ro JOIN recovery_channels rc ON rc.project_id=ro.project_id AND rc.kind=${parsed.data.channel} AND rc.enabled=true
      WHERE ro.id=${req.params.opportunityId} AND ro.project_id=${project.id} AND ro.status IN ('eligible','contacted','clicked')`;
    if(!row) throw new NotFoundError('Oportunidade ou canal não encontrado.');
    const credentials=JSON.parse(decryptSecret(row.credentials_encrypted,env.TRACKING_ENCRYPTION_KEY)) as Record<string,string>;
    const token=decryptSecret(row.recovery_token_encrypted,env.TRACKING_ENCRYPTION_KEY);
    const link=`${env.TRACKING_PUBLIC_BASE_URL.replace(/\/$/,'')}/v1/recovery/r/${token}`;
    const name=row.buyer_name?.split(/\s+/)[0]||'cliente'; let response:Response;
    if(parsed.data.channel==='whatsapp') { if(!row.phone) return reply.code(409).send({error:'phone_missing'}); response=await fetch(`https://graph.facebook.com/${env.META_GRAPH_API_VERSION}/${credentials.phone_number_id}/messages`,{method:'POST',headers:{authorization:`Bearer ${credentials.access_token}`,'content-type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',to:row.phone.replace(/\D/g,''),type:'template',template:{name:row.config.template_name,language:{code:row.config.language||'pt_BR'},components:[{type:'body',parameters:[{type:'text',text:name},{type:'text',text:link}]}]}})}); }
    else if(parsed.data.channel==='sms') { if(!row.phone) return reply.code(409).send({error:'phone_missing'}); const body=new URLSearchParams({To:row.phone,From:credentials.from_number!,Body:(row.config.message||'Olá {{nome}}, retome sua compra: {{link}}').replaceAll('{{nome}}',name).replaceAll('{{link}}',link)}); response=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${credentials.account_sid}/Messages.json`,{method:'POST',headers:{authorization:`Basic ${Buffer.from(`${credentials.account_sid}:${credentials.auth_token}`).toString('base64')}`,'content-type':'application/x-www-form-urlencoded'},body}); }
    else { if(!row.email) return reply.code(409).send({error:'email_missing'}); response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${credentials.api_key}`,'content-type':'application/json'},body:JSON.stringify({from:credentials.from_email,to:[row.email],subject:row.config.subject,html:(row.config.message||'Olá {{nome}}, retome sua compra: {{link}}').replaceAll('{{nome}}',name).replaceAll('{{link}}',`<a href="${link}">Retomar compra</a>`)})}); }
    const result=await response.json().catch(()=>({})); const sent=response.ok; const messageId=ulid();
    await app.db.begin(async(sql)=>{await sql`INSERT INTO recovery_messages(id,opportunity_id,channel_id,state,provider_message_id,content_snapshot,response_status,last_error,sent_at) VALUES(${messageId},${row.opportunity_id},${row.channel_id},${sent?'sent':'failed'},${String((result as {id?:string}).id??'')||null},${sql.json({channel:parsed.data.channel,link} as never)},${response.status},${sent?null:JSON.stringify(result)},${sent?new Date():null})`; if(sent) await sql`UPDATE recovery_opportunities SET status='contacted',first_contact_at=COALESCE(first_contact_at,now()),last_contact_at=now(),updated_at=now() WHERE id=${row.opportunity_id}`;});
    if(!sent) return reply.code(502).send({error:'provider_rejected',provider_status:response.status,detail:result}); return reply.code(202).send({accepted:true,message_id:messageId});
  });
};

export default plugin;
