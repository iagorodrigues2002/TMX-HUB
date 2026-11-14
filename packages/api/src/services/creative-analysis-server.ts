import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rm } from 'node:fs/promises';
import { DelayedError, Queue, Worker } from 'bullmq';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Redis } from 'ioredis';
import { z } from 'zod';
import { creativeFileIdentity } from '@page-cloner/shared/creative-drive-reader';
import { creativeOffer } from '@page-cloner/shared/creative-identity';
import { driveCreativeMedia } from '@page-cloner/shared/drive-creative-media';
import { env } from '../env.js';
import { signJwt } from '../lib/jwt.js';
import { HttpProblem } from '../lib/problem.js';
import { aiAccess, type AiAccess } from './ai-preview-access.js';
import type { AiData } from './ai-preview-model.js';
import { creativeMemories, creativeNiches, ownCreativeEvidence } from './creative-learning.js';
import { creativePersistence } from './creative-persistence.js';
import { cloudCreativeDriveState } from './creative-drive.js';

const QUEUE = 'company-creative-analysis';
const PATH = '/meta-control/traffic/ai/creative-analysis';
const inputSchema = z.object({ key: z.string().min(1).max(160), fileId: z.string().regex(/^[A-Za-z0-9_-]{10,200}$/), offer: z.string().max(80), companyId: z.string().uuid().optional() }).strict();
type Input = z.infer<typeof inputSchema>;
type JobData = Input & { companyId: string; actor: string; automatic?: boolean };
export const creativeAutomaticEligible = (row: { analyzed: boolean; incomplete: boolean | null; spend: number | null }) =>
  !row.analyzed && row.incomplete === false && row.spend !== null && Number.isFinite(row.spend) && row.spend > 200;
const jobId = (company: string, key: string) => createHash('sha256').update(`${company}:${key}`).digest('hex');

export function registerCreativeAnalysisServer(app: FastifyInstance, deps: {
  root: string;
  access: (req: FastifyRequest) => AiAccess;
  data: (access: AiAccess) => Promise<AiData>;
  offers?: (company: string) => Promise<AiData['offers']>;
}) {
  let queue: Queue<JobData> | undefined;
  const getQueue = () => queue ??= new Queue<JobData>(QUEUE, { connection: app.redis });
  let worker: Worker<JobData> | undefined, timer: ReturnType<typeof setInterval> | undefined;
  let workerConnection: Redis | undefined;
  async function authorizedFile(access: AiAccess, input: Input) {
    if (!access.ads || (input.companyId && input.companyId !== access.companyId)) throw new HttpProblem({status:403,title:'Acesso negado',detail:'Criativo fora das permissões desta empresa.'});
    const data = deps.offers ? {companyId:access.companyId,offers:await deps.offers(access.companyId)} as AiData : await deps.data(access);
    const offers = data.offers.filter(o => access.offerIds.includes(o.id) && creativeOffer(o.name) === creativeOffer(input.offer));
    if (offers.length !== 1) throw new HttpProblem({status:403,title:'Oferta não autorizada',detail:'Oferta sem vínculo único com a empresa.'});
    const state = await cloudCreativeDriveState(app.redis, `company:${access.companyId}`);
    const file = state.catalog?.files.find(f => f.id === input.fileId && creativeOffer(f.offer) === creativeOffer(input.offer) && creativeFileIdentity(f)?.key === input.key);
    if (!file) throw new HttpProblem({status:404,title:'Arquivo não encontrado',detail:'Arquivo indisponível no catálogo autorizado do Drive.'});
    return { file, offer: offers[0]!, data };
  }
  async function saved(access: AiAccess, input: Input) {
    const { file, offer, data } = await authorizedFile(access,input);
    const store = creativePersistence(app,deps.root,access);
    const record = (await creativeMemories(deps.root,access,store)).find(r => r.version === 'creative-structure-v1' && r.creativeKey === input.key && r.offerId === offer.id);
    if (!record) return null;
    const assetKey = z.string().regex(/^[a-f0-9]{64}$/).parse((record as typeof record & { assetKey: string }).assetKey);
    const media = await store.read<{frames: unknown[];duration:number}|null>(join(deps.root,'creative-media',access.companyId,`${assetKey}.json`),null);
    const audio = z.object({fingerprint:z.string().regex(/^[a-f0-9]{64}$/)}).safeParse(record.audio);
    const transcription = audio.success ? await store.read(join(deps.root,'spy-transcription',access.companyId,`${audio.data.fingerprint}.json`),null) : null;
    return { analysis: {...record,cached:true}, frames:media?.frames??[], duration:media?.duration??null, transcription, niche:(await creativeNiches(deps.root,access,data,store)).find(o=>o.id===offer.id)?.niche, file:{name:file.name,url:file.url} };
  }
  async function enqueue(access: AiAccess, input: Input, automatic = false) {
    const release=await creativePersistence(app,deps.root,access).read<{ready:boolean}|null>(join(deps.root,'creative-learning',access.companyId,'release.json'),null);
    if(!release?.ready)throw new HttpProblem({status:503,title:'Integração em preparação',detail:'As análises salvas ainda estão sendo transferidas. Nenhuma nova análise foi cobrada.'});
    if (!automatic) await authorizedFile(access,input);
    return getQueue().add('analyze',{...input,companyId:access.companyId,actor:access.userId,automatic},{jobId:jobId(access.companyId,input.key),attempts:1,removeOnComplete:false,removeOnFail:false});
  }
  app.get(PATH,async(req)=>{
    const input=inputSchema.parse(req.query),access=deps.access(req);
    const record=await saved(access,input);
    if(record)return record;
    const job=await getQueue().getJob(jobId(access.companyId,input.key));
    const state=job?await job.getState():null;
    return {analysis:null,pending:state==='active'||state==='waiting'||state==='delayed',error:state==='failed'?'Análise interrompida. A tentativa foi preservada para revisão, sem nova cobrança automática.':null};
  });
  app.post(PATH,async(req,reply)=>{
    const input=inputSchema.parse(req.body),access=deps.access(req);
    const record=await saved(access,input);
    if(record)return record;
    await enqueue(access,input);
    return reply.code(202).send({analysis:null,pending:true});
  });
  app.put(`${PATH}/automation`,async(req,reply)=>{
    const access=deps.access(req);
    if(!access.canManage||!access.ads||!access.allOffers)return reply.code(403).send({detail:'Administrador da empresa com acesso aos criativos necessário.'});
    const {enabled}=z.object({enabled:z.boolean(),companyId:z.string().uuid().optional()}).strict().parse(req.body);
    await creativePersistence(app,deps.root,access).save(join(deps.root,'creative-learning',access.companyId,'automation.json'),{enabled,actor:access.userId,thresholdBrl:200,updatedAt:new Date().toISOString()});
    return {enabled,thresholdBrl:200};
  });
  let scanning=false;
  async function scan() {
    if(scanning)return;
    scanning=true;
    try {
      const configs=await app.db!`SELECT d.company_id,d.document FROM company_creative_documents d JOIN company_ai_settings s ON s.company_id=d.company_id WHERE d.name='creative-learning/automation.json' AND d.document->>'enabled'='true' AND s.config->>'enabled'='true'`;
      for(const c of configs) {
        try {
          const access=await aiAccess(app,String(c.company_id),String(c.document.actor));
          if(!access.canManage||!access.ads||!access.allOffers)continue;
          const data=await deps.data(access), store=creativePersistence(app,deps.root,access);
          const existing=await creativeMemories(deps.root,access,store);
          const state=await cloudCreativeDriveState(app.redis,`company:${access.companyId}`);
          for(const row of ownCreativeEvidence(data,access,{from:data.snapshot.from,to:data.snapshot.to},undefined,state)) {
            if(!creativeAutomaticEligible({analyzed:existing.some(r=>r.version==='creative-structure-v1'&&r.creativeKey===row.key&&r.offerId===row.offerId),incomplete:row.incomplete,spend:row.metrics.spend}))continue;
            const offer=data.offers.find(o=>o.id===row.offerId);
            if(!offer)continue;
            const files=(state.catalog?.files??[]).filter(f=>creativeOffer(f.offer)===creativeOffer(offer.name)&&creativeFileIdentity(f)?.key===row.key);
            const file=files.find(f=>f.id===state.metadata[row.key]?.principalId)??files.sort((a,b)=>a.name.length-b.name.length)[0];
            if(file)await enqueue(access,{key:row.key,fileId:file.id,offer:offer.name},true);
          }
        }catch{app.log.warn({companyId:c.company_id},'Creative automatic scan failed');}
      }
    }finally{scanning=false;}
  }
  app.addHook('onReady',async()=>{
    if(env.NODE_ENV==='test'||process.env.NODE_ENV==='test')return;
    workerConnection=app.redis.duplicate({maxRetriesPerRequest:null});
    workerConnection.on('error',()=>app.log.error('Creative worker Redis unavailable'));
    worker=new Worker<JobData>(QUEUE,async(job,workerToken)=>{
      const access=await aiAccess(app,job.data.companyId,job.data.actor);
      if(job.data.automatic){
        const setting=await creativePersistence(app,deps.root,access).read<{enabled:boolean;actor:string}|null>(join(deps.root,'creative-learning',access.companyId,'automation.json'),null);
        if(!setting?.enabled||setting.actor!==access.userId||!access.canManage||!access.allOffers)throw Error('CREATIVE_AUTOMATION_DISABLED');
      }
      const cached=await saved(access,job.data);
      if(cached)return {cached:true};
      const {file,offer}=await authorizedFile(access,job.data);
      const user=await app.userStore.maybeGetById(access.userId);
      if(!user)throw Error('CREATIVE_ACTOR_REMOVED');
      // Short-lived in-process credential; every paid route rechecks the real membership.
      const {token}=signJwt({sub:user.id,email:user.email,role:user.role},env.JWT_SECRET,1800);
      async function call(path:string,body:unknown){
        const response=await app.inject({method:'POST',url:`/v1/meta-control/traffic/ai/${path}`,headers:{authorization:`Bearer ${token}`},payload:body as Record<string,unknown>});
        if(response.statusCode!==200)throw Error(`CREATIVE_PROVIDER_${response.statusCode}`);
        return response.json();
      }
      const temp=join(tmpdir(),'tmx-creative-jobs',job.id!);
      try {
        const media=await driveCreativeMedia(temp,file.id);
        const store=creativePersistence(app,deps.root,access);
        await store.save(join(deps.root,'creative-media',access.companyId,`${media.hash}.json`),{hash:media.hash,frames:media.frames,duration:media.duration});
        let audio=null;
        if(media.audio){
          const transcription=await call(`spy-transcription?creativeOfferId=${offer.id}`,{companyId:access.companyId,audio:media.audio,analyze:true});
          if(transcription.analysis){const {text:_,...analysis}=transcription.analysis;audio={...analysis,fingerprint:transcription.fingerprint};}
        }
        await call('spy-visual',{kind:'creative',companyId:access.companyId,offerId:offer.id,creativeKey:job.data.key,assetKey:media.hash,ads:[{id:file.id,text:file.name,frames:media.frames}],audio});
        return {cached:false};
      }catch(error){
        if(error instanceof Error && error.message==='CREATIVE_PROVIDER_429'){
          await job.moveToDelayed(Date.now()+20*60_000,workerToken);
          throw new DelayedError();
        }
        throw error;
      }finally{await rm(temp,{recursive:true,force:true});}
    },{connection:workerConnection,concurrency:1,lockDuration:120000});
    worker.on('error',()=>app.log.error('Creative analysis worker failed'));
    timer=setInterval(()=>void scan().catch(()=>app.log.error('Creative scheduler failed')),20*60_000);timer.unref();
    void scan().catch(()=>app.log.error('Creative scheduler failed'));
  });
  app.addHook('onClose',async()=>{if(timer)clearInterval(timer);await worker?.close();await workerConnection?.quit();await queue?.close();});
}
