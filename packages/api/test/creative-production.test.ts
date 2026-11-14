import { test, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { join } from 'node:path';
import type { AiAccess } from '../src/services/ai-preview-access.js';
import type { AiData } from '../src/services/ai-preview-model.js';
import { creativeIdentity } from '@page-cloner/shared/creative-identity';
const mocks=vi.hoisted(()=>({add:vi.fn(),drive:vi.fn()}));
vi.mock('../src/env.js',()=>({env:{NODE_ENV:'test'}}));
vi.mock('bullmq',()=>({Queue:class {add=mocks.add;getJob=async()=>null;close=async()=>{}},Worker:class{},DelayedError:class extends Error{}}));
vi.mock('../src/services/creative-drive.js',()=>({cloudCreativeDriveState:mocks.drive}));
import { creativeAutomaticEligible, registerCreativeAnalysisServer } from '../src/services/creative-analysis-server.js';
import { creativePersistence } from '../src/services/creative-persistence.js';
const company='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
const access={companyId:company,userId:'operator',offerIds:['offer'],ads:true,canManage:true,allOffers:true} as AiAccess;

test('automatic analysis requires complete BRL spend strictly above 200, and skips all saved creatives',()=>{
  const row={analyzed:false,incomplete:false,spend:200};
  for(const spend of [null,0,199.99,200,NaN,Infinity])expect(creativeAutomaticEligible({...row,spend})).toBe(false);
  expect(creativeAutomaticEligible({...row,spend:200.01})).toBe(true);
  expect(creativeAutomaticEligible({...row,spend:100000,analyzed:true})).toBe(false);
  expect(creativeAutomaticEligible({...row,spend:100000,incomplete:true})).toBe(false);
  expect(creativeAutomaticEligible({...row,spend:100000,incomplete:null})).toBe(false);
});

test('production cache is tenant scoped and GET/POST reuse saved frames/audio without enqueueing or paying',async()=>{
  mocks.add.mockClear();
  const identity=creativeIdentity('PJR_ENG_AD05_L17','PJR_ENG')!;
  const key=identity.key,fileId='abcdefghijklmno',fingerprint='a'.repeat(64),assetKey='b'.repeat(64),audioKey='c'.repeat(64);
  mocks.drive.mockResolvedValue({catalog:{files:[{id:fileId,name:'PJR_ENG_AD05_L17.mp4',offer:'PJR_ENG',batch:'Leva 17',identity}]},metadata:{}});
  const record={companyId:company,offerId:'offer',creativeKey:key,status:'complete',version:'creative-structure-v1',key:fingerprint,assetKey,ads:[fileId],at:'2026-11-14T00:00:00Z',audio:{fingerprint:audioKey},result:{hook:'Saved hook'}};
  const app=Fastify();
  const db=async(strings:TemplateStringsArray,...values:unknown[])=>{
    expect(values[0]).toBe(company);
    const q=strings.join('?');
    if(q.includes('SELECT fingerprint'))return [{fingerprint}];
    if(q.includes('company_spy_visual_analyses'))return [{record}];
    if(q.includes('company_spy_transcriptions'))return [{record:{status:'complete',analysis:{text:'Saved speech'}}}];
    if(values[1]===`creative-media/${assetKey}.json`)return [{document:{frames:[{second:0,image:'saved'}],duration:10}}];
    return [];
  };
  app.decorate('db',db);app.decorate('redis',{});
  const root='/tmp/creative-production-test';
  registerCreativeAnalysisServer(app,{root,access:()=>access,data:async()=>({companyId:company,offers:[{id:'offer',name:'PJR_ENG'}]} as AiData)});
  try{
    const args={key,fileId,offer:'PJR_ENG'};
    const get=await app.inject({method:'GET',url:'/meta-control/traffic/ai/creative-analysis?'+new URLSearchParams(args)});
    expect(get.statusCode,get.body).toBe(200);
    expect(get.json().analysis.cached).toBe(true);
    expect(get.json().frames).toHaveLength(1);
    expect(get.json().transcription.analysis.text).toBe('Saved speech');
    const post=await app.inject({method:'POST',url:'/meta-control/traffic/ai/creative-analysis',payload:args});
    expect(post.statusCode,post.body).toBe(200);
    expect(mocks.add).not.toHaveBeenCalled();
    const store=creativePersistence(app,root,access);
    await expect(store.read(join(root,'spy-visual',other,fingerprint+'.json'),null)).rejects.toThrow('CREATIVE_STORAGE_SCOPE');
    await expect(store.save(join(root,'spy-visual',company,fingerprint+'.json'),{})).rejects.toThrow('READ_ONLY');
    const denied=await app.inject({method:'GET',url:'/meta-control/traffic/ai/creative-analysis?'+new URLSearchParams({...args,companyId:other})});
    expect(denied.statusCode).not.toBe(200);
  }finally{await app.close();}
});
