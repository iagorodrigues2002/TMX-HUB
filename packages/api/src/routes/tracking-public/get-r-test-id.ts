import type { FastifyInstance } from 'fastify';
import { ulid } from 'ulid';
import { env } from '../../env.js';
import { createTrackingToken } from '../../lib/tracking-token.js';
import { checkUpsellCompatibility } from '../../services/upsell-compatibility.js';
import type { createAbRedirectHandlerContext } from './ab-redirect-handler-context.js';
import { extractAttributionQuery, readRotatingTrackingToken } from './attribution.js';
import { cookieValue } from './browser-request.js';
import type { createUpsellDestinationForAccountContext } from './upsell-destination-for-account-context.js';
import { createUpsellToken } from './upsell-token.js';

export function registerGetRTestIdRoutes(
  app: FastifyInstance,
  context0: ReturnType<typeof createUpsellDestinationForAccountContext>,
  context1: ReturnType<typeof createAbRedirectHandlerContext>,
) {
  const { upsellDestinationForAccount, hasConfirmedUpsellIdentity } = context0;
  const { abRedirectHandler } = context1;

  app.get('/r/:testId', abRedirectHandler);

  app.get('/link/:testId', abRedirectHandler);

  app.get<{ Querystring: { key?: string; stage?: string } }>(
    '/track/upsell/u.js',
    async (req, reply) => {
      if (!app.db || !req.query.key || !req.query.stage) {
        return reply.code(404).type('application/javascript').send('/* TMX Upsell indisponível */');
      }
      const [stage] = await app.db<Array<{ stage_key: string }>>`
      SELECT us.stage_key
      FROM tracking_upsell_stages us
      JOIN tracking_projects p ON p.id=us.project_id
      WHERE p.public_key=${req.query.key} AND p.enabled=true
        AND us.stage_key=${req.query.stage} AND us.enabled=true
      LIMIT 1
    `;
      if (!stage) {
        return reply
          .code(404)
          .type('application/javascript')
          .send('/* Etapa de upsell inválida */');
      }
      const config = JSON.stringify({ key: req.query.key, stage: stage.stage_key });
      const script = `(()=>{const C=${config},S=document.currentScript,O=new URL(S.src).origin,E=O+'/v1/track/upsell/events',P=new URL(location.href).searchParams,VK='_tmx_v',JK='_tmx_j',uuid=()=>crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2);let visitor=localStorage.getItem(VK)||uuid(),journey=localStorage.getItem(JK)||uuid(),decision='',manualVendid='';localStorage.setItem(VK,visitor);localStorage.setItem(JK,journey);const token=P.get('tmx_u')||'',source={};for(const[k,v]of P)if(/^(utm_.*|campaign_.*|adset_.*|ad_.*|placement|site_source_name|fbclid|_fb[cp]|src)$/.test(k))source[k]=v;const read=(store,key)=>{try{return store.getItem(key)||''}catch{return''}},cookie=k=>{try{return decodeURIComponent(document.cookie.split('; ').find(x=>x.startsWith(k+'='))?.split('=').slice(1).join('=')||'')}catch{return''}},vendid=()=>{const v=manualVendid||P.get('vendaId')||P.get('venda_id')||P.get('vendid')||P.get('vendId')||window.vendaId||window.vendid||window.vendId||document.documentElement.dataset.vendaId||document.documentElement.dataset.vendid||read(localStorage,'vendaId')||read(localStorage,'vendid')||read(sessionStorage,'vendaId')||read(sessionStorage,'vendid')||cookie('vendaId')||cookie('vendid')||'';return v?String(v).slice(0,1024):''};const send=(name,properties={})=>{const body=JSON.stringify({public_key:C.key,stage_key:C.stage,token,visitor_id:visitor,journey_id:journey,event_name:name,event_url:location.href,source,properties,vendid:vendid()||undefined,client_at:new Date().toISOString()});if(navigator.sendBeacon)navigator.sendBeacon(E,new Blob([body],{type:'application/json'}));else fetch(E,{method:'POST',headers:{'content-type':'application/json'},body,keepalive:true}).catch(()=>{})};const started=Date.now();send('UpsellPageView',{title:document.title,load_ms:Math.round(performance.now())});setTimeout(()=>{if(document.visibilityState==='visible')send('UpsellOfferView',{visible_ms:Date.now()-started})},800);document.addEventListener('click',e=>{const el=e.target.closest?.('[data-tmx-upsell-accept],[data-tmx-upsell-decline],a,button');if(!el)return;const label=(el.textContent||el.getAttribute('aria-label')||'').trim().slice(0,160),href=el.href||null,isAccept=el.hasAttribute('data-tmx-upsell-accept')||/sim|quero|adicionar|aceitar|comprar|continuar/i.test(label),isDecline=el.hasAttribute('data-tmx-upsell-decline')||/não|nao|recusar|dispensar|sem.*obrigad/i.test(label);if(isAccept){decision='accept';send('UpsellAcceptClick',{label,href})}else if(isDecline){decision='decline';send('UpsellDeclineClick',{label,href})}},true);const seen=new Set;addEventListener('scroll',()=>{const h=document.documentElement.scrollHeight-innerHeight,p=h>0?Math.round(scrollY/h*100):100;for(const mark of[25,50,75,90])if(p>=mark&&!seen.has(mark)){seen.add(mark);send('UpsellScroll',{percent:mark})}},{passive:true});addEventListener('error',e=>send('UpsellPageError',{message:String(e.message||'resource_error').slice(0,300),source:e.filename||null,line:e.lineno||null}),true);addEventListener('unhandledrejection',e=>send('UpsellPageError',{message:String(e.reason||'unhandled_rejection').slice(0,300)}));addEventListener('pagehide',()=>{if(!decision)send('UpsellExit',{time_ms:Date.now()-started,scroll_percent:[...seen].pop()||0})});window.tmx=window.tmx||{};window.tmx.upsell={track:send,identify:v=>{manualVendid=String(v||'').slice(0,1024);send('UpsellOfferView',{manual_identify:true,vendid_present:Boolean(manualVendid)})}}})();`;
      reply
        .header('cache-control', 'public, max-age=60')
        .type('application/javascript; charset=utf-8')
        .send(script);
    },
  );

  app.get<{ Params: { slug: string }; Querystring: Record<string, string | undefined> }>(
    '/u/:slug/check',
    async (req, reply) => {
      if (!app.db) return reply.code(503).send({ compatible: false, reason: 'unavailable' });
      const vendaId = req.query.vendaId?.trim();
      if (!vendaId) return reply.code(400).send({ compatible: false, reason: 'missing_venda_id' });
      const [stage] = await app.db<
        Array<{
          project_id: string;
          destination_url: string;
          connection_destinations: Record<string, string>;
          enabled: boolean;
        }>
      >`
        SELECT project_id,destination_url,connection_destinations,enabled FROM tracking_upsell_stages
        WHERE slug=${req.params.slug} LIMIT 1
      `;
      if (!stage?.enabled) return reply.code(404).send({ compatible: false, reason: 'inactive' });
      const destinationUrl = await upsellDestinationForAccount(stage, vendaId);
      if (!destinationUrl) {
        return reply.code(200).send({ compatible: false, reason: 'account_not_configured' });
      }
      // VendePay can expire or consume an intent after it has worked. Once the
      // TMX has confirmed and stored the buyer vendaId, keep the historic link
      // available instead of downgrading it because of a later 404.
      const compatible =
        (await hasConfirmedUpsellIdentity(stage.project_id, vendaId)) ||
        (await checkUpsellCompatibility(destinationUrl, vendaId));
      reply.header('cache-control', 'private, max-age=300');
      return { compatible, reason: compatible ? null : 'vendepay_not_eligible' };
    },
  );

  app.get<{ Params: { slug: string }; Querystring: Record<string, string | undefined> }>(
    '/u/:slug',
    async (req, reply) => {
      if (!app.db) return reply.code(503).send({ error: 'tracking_unavailable' });
      const [stage] = await app.db<
        Array<{
          id: string;
          project_id: string;
          destination_url: string;
          connection_destinations: Record<string, string>;
          enabled: boolean;
        }>
      >`
        SELECT id, project_id, destination_url, connection_destinations, enabled
        FROM tracking_upsell_stages WHERE slug=${req.params.slug} LIMIT 1
      `;
      if (!stage?.enabled) return reply.code(404).send({ error: 'upsell_stage_inactive' });
      const requestedVendaId = req.query.vendaId?.trim();
      const destinationUrl = await upsellDestinationForAccount(stage, requestedVendaId);
      if (!destinationUrl) {
        return reply
          .code(422)
          .type('text/html; charset=utf-8')
          .send(
            `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Conta não configurada · TMX</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#06151c;color:#dffaff;font-family:Inter,system-ui,sans-serif}.box{max-width:560px;margin:24px;padding:32px;border:1px solid #1d5866;border-radius:20px;background:#09232c;box-shadow:0 0 50px #00d9ff18}h1{font-size:24px;margin:0 0 12px}p{color:#9cc4cc;line-height:1.6}button{margin-top:12px;border:1px solid #2edcf2;border-radius:10px;padding:10px 16px;background:#0a303a;color:#dffaff;cursor:pointer}</style></head><body><main class="box"><h1>Link não configurado para esta conta VendePay</h1><p>Cadastre o destino desta etapa no Upsell Intelligence antes de abrir este comprador.</p><button onclick="history.back()">Voltar para a lista</button></main></body></html>`,
          );
      }
      if (
        requestedVendaId &&
        req.query.force !== '1' &&
        !(await hasConfirmedUpsellIdentity(stage.project_id, requestedVendaId))
      ) {
        // Never trust the preview cache for the actual navigation. Confirm the
        // Vendepay intent again at click time so a stale positive cannot send
        // the operator to a widget that is currently unavailable.
        const compatible = await checkUpsellCompatibility(destinationUrl, requestedVendaId, true);
        if (!compatible) {
          return reply
            .code(422)
            .type('text/html; charset=utf-8')
            .send(
              `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Oferta incompatível · TMX</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#06151c;color:#dffaff;font-family:Inter,system-ui,sans-serif}.box{max-width:560px;margin:24px;padding:32px;border:1px solid #1d5866;border-radius:20px;background:#09232c;box-shadow:0 0 50px #00d9ff18}h1{font-size:24px;margin:0 0 12px}p{color:#9cc4cc;line-height:1.6}button{margin-top:12px;border:1px solid #2edcf2;border-radius:10px;padding:10px 16px;background:#0a303a;color:#dffaff;cursor:pointer}</style></head><body><main class="box"><h1>Este comprador não é elegível para este upsell</h1><p>O TMX consultou a Vendepay e ela não reconheceu esta combinação de venda e oferta. Nenhuma página quebrada foi aberta.</p><button onclick="history.back()">Voltar para a lista</button></main></body></html>`,
            );
        }
      }
      const linked = req.query.src ? readRotatingTrackingToken(req.query.src, req) : null;
      const validLinked = linked?.projectId === stage.project_id ? linked : null;
      const visitorId =
        validLinked?.visitorId ?? cookieValue(req.headers.cookie, '_tmx_upsell_v') ?? ulid();
      const journeyId = validLinked?.journeyId ?? ulid();
      const source = extractAttributionQuery(req.query);
      const redirectId = ulid();
      await app.db.begin(async (sql) => {
        await sql`
          INSERT INTO tracking_upsell_redirects
            (id,stage_id,project_id,visitor_id,journey_id,source,client_ip,user_agent)
          VALUES(${redirectId},${stage.id},${stage.project_id},${visitorId},${journeyId},
            ${sql.json(source)},${req.ip},${req.headers['user-agent'] ?? null})
        `;
        await sql`
          INSERT INTO tracking_events
            (id,project_id,visitor_id,journey_id,event_name,event_category,event_url,
             source,properties,client_ip,user_agent,received_at)
          VALUES(${redirectId},${stage.project_id},${visitorId},${journeyId},'UpsellRedirect',
            'commerce',${`${env.TRACKING_PUBLIC_BASE_URL.replace(/\/$/, '')}/v1/u/${req.params.slug}`},
            ${sql.json(source)},${sql.json({ upsell_stage_id: stage.id })},${req.ip},
            ${req.headers['user-agent'] ?? null},now())
        `;
      });
      const destination = new URL(destinationUrl);
      for (const [key, value] of Object.entries(req.query)) {
        if (!value || key === 'src' || key === 'tmx_u') continue;
        if (!destination.searchParams.has(key)) destination.searchParams.set(key, value);
      }
      destination.searchParams.set(
        'tmx_u',
        createUpsellToken({ projectId: stage.project_id, stageId: stage.id, visitorId, journeyId }),
      );
      destination.searchParams.set(
        'src',
        createTrackingToken(
          { projectId: stage.project_id, visitorId, journeyId },
          env.WEBHOOK_SECRET,
        ),
      );
      reply.header(
        'set-cookie',
        `_tmx_upsell_v=${visitorId}; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax`,
      );
      return reply.redirect(destination.toString(), 302);
    },
  );
}
