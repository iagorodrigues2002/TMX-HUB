import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { creativeIdentity } from '@page-cloner/shared/creative-identity';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test, vi } from 'vitest';
vi.mock('../src/env.js', () => ({ env: { NODE_ENV: 'test' } }));
import Fastify from 'fastify';
import {
  defaultCreativeNiche,
  permittedCreativeMemory,
  registerCreativeLearning,
  creativeNiches,
  ownCreativeEvidence,
  saveCreativeLearningNote,
  creativeLearningContext,
  comparableCreativeKeys,
} from '../src/services/creative-learning.js';
import type { AiAccess } from '../src/services/ai-preview-access.js';
import type { AiData } from '../src/services/ai-preview-model.js';
const companyId = '00000000-0000-4000-8000-000000000001';
const offerId = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const access = {
  companyId,
  userId: 'test',
  ads: true,
  spy: false,
  canManage: true,
  allOffers: false,
  offerIds: [offerId],
} as AiAccess;
const data = {
  companyId,
  offers: [
    { id: offerId, name: 'PJR_ENG' },
    { id: 'hidden', name: 'SLM_DE' },
  ],
} as AiData;
test('comparisons reject tiny-spend references and do not require hook rate', () => {
  const target = {key:'target',offerId,incomplete:false,metrics:{spend:37000,impressions:100000,hookRate:null}};
  const row=(key:string,spend:number,id=offerId)=>({...target,key,offerId:id,metrics:{...target.metrics,spend}});
  assert.deepEqual(comparableCreativeKeys([target,row('tiny',300),row('peer',30000),row('other',37000,'hidden'),row('huge',100000)],target),['peer']);
  assert.deepEqual(comparableCreativeKeys([target,row('tiny',300)],target),[]);
  assert.deepEqual(comparableCreativeKeys([row('tiny',300)]),[]);
});
test('niche defaults follow offer family, unknown stays unclassified', () => {
  assert.equal(defaultCreativeNiche('PJR_ENG'), 'Renda extra');
  assert.equal(defaultCreativeNiche('SLM_DE'), 'Relacionamento');
  assert.equal(defaultCreativeNiche('UNKNOWN'), '');
});
test('inventory deduplicates versions, honors principal and excludes unauthorized offers', async()=>{
  const temp=await mkdtemp(join(tmpdir(),'creative-inventory-')),root=join(temp,'ai');
  const base=join(temp,'creative-drive-preview');await mkdir(base);
  const owner=createHash('sha256').update(access.userId).digest('hex');
  const identity=creativeIdentity('PJR_ENG_AD01_L1','PJR_ENG');
  const f=(id:string,name:string,offer='PJR_ENG')=>({id,name,offer,batch:'Leva 1',identity:offer==='PJR_ENG'?identity:creativeIdentity('SLM_DE_AD01_L1','SLM_DE')});
  await writeFile(join(base,`${owner}.catalog.json`),JSON.stringify({catalog:{files:[f('raw','PJR_ENG_AD01_L1.mp4'),f('main','PJR_ENG_AD01_L1_creative.mp4'),f('hidden','SLM_DE_AD01_L1.mp4','SLM_DE')]}}));
  await writeFile(join(base,`${owner}.metadata.json`),JSON.stringify({[identity!.key]:{principalId:'main',status:'Validado'}}));
  const raw={...data,classification:{campaigns:{},links:{}},snapshot:{from:'2026-11-11',to:'2026-11-11',fetchedAt:'2026-11-11T12:00:00Z',accounts:[],campaigns:[],insights:[],failures:[]},fetchedAt:'2026-11-11T12:00:00Z',sales:[],reversals:[],optimizations:[]} as AiData;
  const app=Fastify();registerCreativeLearning(app,{root,access:()=>access,data:async()=>raw});
  try{
    const r=await app.inject({method:'GET',url:'/meta-control/traffic/ai/creative-learning/inventory'});assert.equal(r.statusCode,200);const v=r.json();assert.equal(v.items.length,1);assert.equal(v.items[0].files,2);assert.equal(v.items[0].fileId,'main');assert.equal(v.items[0].analyzed,false);
    const savedDir=join(root,'spy-visual',companyId);await mkdir(savedDir,{recursive:true});
    await writeFile(join(savedDir,'c'.repeat(64)+'.json'),JSON.stringify({status:'complete',companyId,offerId,version:'creative-structure-v1',creativeKey:identity!.key,at:raw.fetchedAt,ads:['main'],result:{hook:'Texto sobre vídeo'}}));
    const evidence=await creativeLearningContext(root,access,raw,'Analise PJR_ENG_AD01_L1');
    assert.equal(evidence.target?.key,identity!.key);assert.equal(evidence.target?.metrics,null);
    assert.deepEqual(evidence.target?.visual?.result,{hook:'Texto sobre vídeo'});
    await saveCreativeLearningNote(root,access,{id:'unmeasured',question:'Analise PJR_ENG_AD01_L1',answer:'Análise visual sem métricas.'},evidence);
    assert.equal((await creativeLearningContext(root,access,raw,'Analise PJR_ENG_AD01_L1')).previousAnalyses.length,1);
    assert.equal((await creativeLearningContext(root,{...access,offerIds:[]},raw,'Analise PJR_ENG_AD01_L1')).target,null);
  }finally{await app.close();await rm(temp,{recursive:true,force:true});}
});
test('visual memories enforce company, area, offer and separate competitor permission', () => {
  const record = {
    companyId,
    offerId,
    status: 'complete',
    version: 'creative-structure-v1',
    at: '',
    ads: [],
    result: {},
  };
  assert.equal(permittedCreativeMemory(record, access), true);
  for (const item of [
    { ...record, companyId: 'other' },
    { ...record, offerId: 'hidden' },
    { ...record, status: 'pending' },
    { ...record, version: 'spy-structure-v1' },
  ])
    assert.equal(permittedCreativeMemory(item, access), false);
  assert.equal(permittedCreativeMemory(record, { ...access, ads: false }), false);
});
test('metrics include creatives below the old top-120 cut and recompute ratios across ads', async () => {
  const campaign = {
    id: '1',
    name: 'PJR_ENG',
    accountId: 'act_1',
    status: 'ACTIVE',
    effectiveStatus: 'ACTIVE',
    objective: 'SALES',
    createdAt: null,
    updatedAt: null,
  };
  const insight = (n: number, adId = String(n), spend = String(n)) => ({
    campaignId: '1',
    accountId: 'act_1',
    date: '2026-11-11',
    currency: 'BRL',
    spend,
    impressions: '1000',
    linkClicks: '10',
    actions: [
      { action_type: 'video_view', value: '300' },
      { action_type: 'purchase', value: '2' },
    ],
    actionValues: [{ action_type: 'purchase', value: '20' }],
    adId,
    adName: `PJR_ENG_AD${n}_L1`,
    video: true,
  });
  const raw = {
    ...data,
    fetchedAt: '2026-11-12T12:00:00Z',
    sales: [],
    reversals: [],
    optimizations: [],
    classification: { campaigns: { '1': 'PJR_ENG' }, links: { PJR_ENG: offerId } },
    snapshot: {
      fetchedAt: '2026-11-12T12:00:00Z',
      from: '2026-11-11',
      to: '2026-11-11',
      accounts: [
        {
          id: 'act_1',
          name: 'Account',
          businessId: null,
          businessName: null,
          currency: 'BRL',
          timezone: 'America/Sao_Paulo',
        },
      ],
      campaigns: [campaign],
      ads: [],
      insights: [
        ...Array.from({ length: 150 }, (_, i) => insight(i + 1)),
        insight(1, '999', '0.5'),
      ],
      failures: [],
    },
  } as AiData;
  const rows = ownCreativeEvidence(
    raw,
    { ...access, campaigns: true },
    { from: '2026-11-11', to: '2026-11-11' },
  );
  assert.equal(rows.length, 150);
  const low = rows.find((r) => r.key === 'PJR_ENG:AD1:L1');
  assert.ok(low);
  assert.equal(low.metrics.spend, 1.5);
  assert.equal(low.metrics.cpc, 0.075);
  assert.equal(low.metrics.cpm, 0.75);
  const attribution = {
    source: 'tmx-tracking' as const, ownerId: access.userId,
    from: '2026-11-11', to: '2026-11-11', fetchedAt: raw.fetchedAt,
    rows: ['1', '999'].map((adId) => ({
      offerId, campaignId: '1', accountId: '1', adsetId: null, adId,
      fronts: 1, upsells: 2, naturalUpsells: 1, clickedUpsells: 1,
      grossBrlMinor: '5000', grossUsdMinor: '1000', netBrlMinor: '4500', netUsdMinor: '900',
      upsellGrossBrlMinor: '3000', upsellGrossUsdMinor: '600',
      naturalGrossBrlMinor: '1000', clickedGrossBrlMinor: '2000',
      naturalGrossUsdMinor: '200', clickedGrossUsdMinor: '400',
    })),
  };
  const withFunnel = (a = attribution) => ownCreativeEvidence(raw, access,
    { from: '2026-11-11', to: '2026-11-11' }, a).find((r) => r.key === low.key)!;
  const funnel = withFunnel();
  assert.equal(funnel.metrics.upsells, 4);
  assert.equal(funnel.metrics.tmxGross, 100);
  assert.equal(funnel.metrics.funnelArpu, 50);
  assert.equal(funnel.metrics.tmxCreativeRoas, (40 + 60) / 1.5);
  const file = {id:'confirmed-file-123',name:'PJR_ENG_AD01_L1.mp4',offer:'PJR_ENG',batch:'Leva 1',url:'https://drive.google.com/file/d/confirmed-file-123/view',thumbnail:null,identity:creativeIdentity('PJR_ENG_AD01_L1','PJR_ENG')};
  const catalog = {rootId:'root',rootName:'Drive',at:raw.fetchedAt,foldersRead:1,offers:[],files:[file]};
  const ambiguous = {...raw,snapshot:{...raw.snapshot,insights:raw.snapshot.insights.map(r=>r.adId==='999'?{...r,adName:'PJR_ENG_AD01'}:r)}};
  const resolved = ownCreativeEvidence(ambiguous,access,{from:'2026-11-11',to:'2026-11-11'},attribution,{catalog});
  assert.equal(resolved.find(r=>r.key===low.key)?.metrics.spend,1.5);
  assert.equal(resolved.find(r=>r.key===low.key)?.metrics.upsells,4);
  const reviewed = {...raw,snapshot:{...raw.snapshot,insights:raw.snapshot.insights.map(r=>r.adId==='999'?{...r,adName:'PJR_ENG_AD02_L1'}:r)}};
  const corrected = ownCreativeEvidence(reviewed,access,{from:'2026-11-11',to:'2026-11-11'},attribution,{catalog,reviewedAds:{'999':{name:'PJR_ENG_AD02_L1',campaign:'PJR_ENG',offer:'PJR_ENG',batch:'Leva 1',fileId:file.id}}});
  assert.equal(corrected.find(r=>r.key===low.key)?.metrics.spend,1.5);
  assert.equal(corrected.find(r=>r.key===low.key)?.metrics.upsells,4);
  const chatScope={from:'2026-11-11',to:'2026-11-11',offer:'PJR_ENG',query:'campaign name differs',level:'ads'};
  const chatRows=ownCreativeEvidence(reviewed,access,chatScope,attribution,{catalog,reviewedAds:{'999':{name:'PJR_ENG_AD02_L1',campaign:'PJR_ENG',offer:'PJR_ENG',batch:'Leva 1',fileId:file.id}}});
  assert.deepEqual(chatRows.map(({key,metrics,ads})=>({key,metrics,ads})),corrected.map(({key,metrics,ads})=>({key,metrics,ads})));
  assert.deepEqual(ownCreativeEvidence(reviewed,{...access,offerIds:[]},{from:'2026-11-11',to:'2026-11-11'},attribution,{catalog}),[]);
  assert.equal(withFunnel({ ...attribution, from: '2026-11-10' }).metrics.tmxGross, null);
  assert.equal(withFunnel({ ...attribution, rows: attribution.rows.map((r) => ({ ...r, offerId: 'hidden' })) }).metrics.upsells, null);
  assert.equal(low.metrics.tmxGross, null);
  const root=await mkdtemp(join(tmpdir(),'creative-audio-context-'));
  try {
    await mkdir(join(root,'spy-visual',companyId),{recursive:true});
    await mkdir(join(root,'spy-transcription',companyId),{recursive:true});
    const fingerprint='a'.repeat(64);
    await writeFile(join(root,'spy-visual',companyId,`${'b'.repeat(64)}.json`),JSON.stringify({status:'complete',version:'creative-structure-v1',companyId,offerId,creativeKey:low.key,at:raw.fetchedAt,ads:['file'],result:{},audio:{fingerprint}}));
    await writeFile(join(root,'spy-transcription',companyId,`${fingerprint}.json`),JSON.stringify({status:'complete',analysis:{text:'Tap below to see the offer.'}}));
    const context=await creativeLearningContext(root,access,raw,'Analise PJR_ENG_AD01_L1');
    assert.equal(context.target?.audioTranscript?.text,'Tap below to see the offer.');
    assert.equal(context.target?.audioTranscript?.truncated,false);
  } finally { await rm(root,{recursive:true,force:true}); }
  assert.throws(() => ownCreativeEvidence({ ...raw, companyId: 'other' }, access,
    { from: '2026-11-11', to: '2026-11-11' }, attribution));
  assert.equal(
    ownCreativeEvidence(raw, { ...access, ads: false }, { from: '2026-11-11', to: '2026-11-11' })
      .length,
    0,
  );
});
test('manual niche persists across sessions, accepts real ULIDs and never exposes other offers', async () => {
  const root = await mkdtemp(join(tmpdir(), 'creative-niche-'));
  const app = Fastify();
  registerCreativeLearning(app, { root, access: () => access, data: async () => data });
  try {
    const save = await app.inject({
      method: 'PUT',
      url: '/meta-control/traffic/ai/creative-learning/niche',
      payload: { offerId, niche: 'Finanças pessoais' },
    });
    assert.equal(save.statusCode, 200);
    assert.equal((await creativeNiches(root, access, data))[0]?.niche, 'Finanças pessoais');
    assert.equal((await creativeNiches(root, access, data)).length, 1);
    assert.equal(
      (
        await app.inject({
          method: 'PUT',
          url: '/meta-control/traffic/ai/creative-learning/niche',
          payload: { offerId: 'hidden', niche: 'Other' },
        })
      ).statusCode,
      403,
    );
    await assert.rejects(() => creativeNiches(root, access, { ...data, companyId: 'other' }));
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
test('saved conclusions survive reload and retain offer and Spy restrictions',async()=>{
 const root=await mkdtemp(join(tmpdir(),'creative-notes-'));
 const raw={...data,classification:{campaigns:{},links:{}},snapshot:{from:'2026-11-11',to:'2026-11-11',fetchedAt:'2026-11-11T12:00:00Z',accounts:[],campaigns:[],insights:[],failures:[]},fetchedAt:'2026-11-11T12:00:00Z',sales:[],reversals:[],optimizations:[]} as AiData;
 try{
  const evidence={offers:[{id:offerId}],creatives:[{key:'PJR_ENG:AD1:L1',offerId}],competitors:[]} as unknown as Awaited<ReturnType<typeof creativeLearningContext>>;
  const note={id:'one',question:'Compare hooks',answer:'Hypothesis, not proven'};
  await saveCreativeLearningNote(root,access,note,evidence);await saveCreativeLearningNote(root,access,note,evidence);
  assert.equal((await creativeLearningContext(root,access,raw,'PJR_ENG')).previousAnalyses.length,1);
  assert.equal((await creativeLearningContext(root,{...access,offerIds:[]},raw,'PJR_ENG')).previousAnalyses.length,0);
  await saveCreativeLearningNote(root,{...access,spy:true,allOffers:true},{...note,id:'spy'},{...evidence,competitors:[{} as never]});
  assert.equal((await creativeLearningContext(root,access,raw,'PJR_ENG')).previousAnalyses.length,1);
  assert.equal((await creativeLearningContext(root,{...access,spy:true,allOffers:true},raw,'PJR_ENG')).previousAnalyses.length,2);
 }finally{await rm(root,{recursive:true,force:true});}
});
