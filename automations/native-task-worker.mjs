export const prepareNativeDeliveries = String.raw`
const base=String($vars.TMX_TASK_WEB_BASE||'').replace(/\/$/,'');
const web=new URL(base);
if(web.username||web.password||(web.protocol!=='https:'&&!(web.protocol==='http:'&&['localhost','127.0.0.1'].includes(web.hostname))))throw new Error('Configure a URL pública segura do TMX');
const clean=value=>String(value??'').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'');
const date=value=>new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}).format(new Date(value));
return $input.first().json.deliveries.map(lease=>{
 if(!/^\d+$/.test(lease.channelId)||!Number.isSafeInteger(lease.revision)||lease.revision<1)throw new Error('Reserva ou canal inválido');
 const reminder=lease.entityKind==='reminder';
 const item=reminder?lease.body.call:lease.body;
 if(item.managementMode!=='native'||item.revision!==lease.revision)throw new Error('Entidade nativa divergente');
 const task=lease.entityKind==='task';
 const people=task?item.assignees:item.participants;
 const users=people.map(p=>p.discordId).filter(id=>typeof id==='string'&&/^\d+$/.test(id));
 const names=people.map(p=>p.discordId&&users.includes(p.discordId)?'<@'+p.discordId+'>':clean(p.name)).join(' · ');
 const marker='[TMX:NATIVE:'+lease.entityKind.toUpperCase()+':'+item.id+']';
 let lines,components;
 if(task){
  const labels={pending:'Pendente',progress:'Em progresso',done:'Concluída'};
  if(!labels[item.status])throw new Error('Status nativo inválido');
  lines=['**'+clean(item.title)+'**',labels[item.status]+' · '+clean(item.sector)+(item.offer?' · '+clean(item.offer):''),names,'Prazo: '+(item.dueAt?date(item.dueAt):'não definido'),clean(item.description)];
  components=[{type:1,components:Object.entries(labels).map(([status,label])=>({type:2,style:status===item.status?1:2,label,custom_id:'tmx:native:'+item.id+':'+item.revision+':'+status,disabled:status===item.status}))}];
 }else{
  const meeting=new URL(item.meetingUrl);if(meeting.protocol!=='https:'||meeting.username||meeting.password)throw new Error('Link de call inválido');
  const heading=reminder?(lease.body.minutes===0?'A call começa agora':'Call em '+lease.body.minutes+' minutos'):{scheduled:'Call agendada',completed:'Call realizada',cancelled:'Call cancelada'}[item.status];
  lines=['**'+heading+' — '+clean(item.title)+'**',date(item.startsAt)+' · São Paulo · '+item.durationMinutes+' min',names,clean(item.message)];
  components=item.status==='scheduled'?[{type:1,components:[{type:2,style:5,label:'Entrar na call',url:item.meetingUrl}]}]:[];
 }
 const method=!reminder&&lease.messageId?'PATCH':'POST';
 if(lease.messageId&&!/^\d+$/.test(lease.messageId))throw new Error('Identidade da mensagem inválida');
 const content=lines.filter(Boolean).join('\n').slice(0,1998-marker.length)+'\n'+marker;
 const discordBody={content,allowed_mentions:{parse:[],users:method==='POST'?users:[]},components};
 // Nonce deduplicates briefly; uncertain sends remain quarantined in the TMX ledger.
 if(method==='POST'){discordBody.nonce=lease.id.replace(/[^a-zA-Z0-9]/g,'').slice(-25);discordBody.enforce_nonce=true;}
 return {json:{lease,marker,discordBody,discordMethod:method,discordUrl:'https://discord.com/api/v10/channels/'+lease.channelId+'/messages'+(method==='PATCH'?'/'+lease.messageId:'')}};
});`;

export const confirmNativeDelivery = String.raw`
const input=$('Preparar entregas nativas').item.json;
const response=$input.item.json;
const result={id:input.lease.id,leaseId:input.lease.leaseId,revision:input.lease.revision,outcome:'uncertain'};
const status=Number(response.statusCode||0),body=response.body||{};
if(status>=200&&status<300&&/^\d+$/.test(String(body.id||''))&&String(body.channel_id)===input.lease.channelId&&String(body.content||'').includes(input.marker)&&(!input.lease.messageId||String(body.id)===input.lease.messageId)){
 result.outcome='confirmed';result.messageId=String(body.id);result.channelId=String(body.channel_id);
}else if(status===429){
 result.outcome='retryable';result.retryAfterMs=Math.min(600000,Math.max(1000,Math.ceil(Number(body.retry_after)||1)*1000));
}else if(status>=400&&status<500){result.outcome='permanent';}
return {json:result};`;

export const prepareNativeInteraction = String.raw`
// Input must come from the existing authenticated Discord gateway, not a public webhook.
const event=$input.first().json;
const match=String(event.data?.custom_id||'').match(/^tmx:native:([0-9a-f-]{36}):([1-9][0-9]*):(pending|progress|done)$/i);
if(!match)return [];
const actor=event.member?.user?.id||event.user?.id;
if(!/^\d+$/.test(String(actor||''))||!/^\d+$/.test(String(event.id||''))||!/^\d+$/.test(String(event.message?.id||''))||!/^\d+$/.test(String(event.channel_id||'')))throw new Error('Identidade do gateway Discord inválida');
return [{json:{interactionId:String(event.id),taskId:match[1],revision:Number(match[2]),status:match[3],actorDiscordId:String(actor),messageId:String(event.message.id),channelId:String(event.channel_id)}}];`;

const apiCredential = {
  httpHeaderAuth: { id: 'CONFIGURE_NATIVE_TMX_HEADER', name: 'TMX Native Tasks API' },
};
const discordCredential = {
  discordBotApi: { id: 'CONFIGURE_NATIVE_DISCORD_BOT', name: 'TMX Native Discord Bot' },
};
const code = (name, jsCode, mode = 'runOnceForEachItem') => ({
  name,
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  parameters: { jsCode, mode },
});
function http(name, parameters, credentials = apiCredential) {
  const api = credentials === apiCredential;
  return {
    name,
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    parameters: {
      authentication: api ? 'genericCredentialType' : 'predefinedCredentialType',
      ...(api ? { genericAuthType: 'httpHeaderAuth' } : { nodeCredentialType: 'discordBotApi' }),
      options: { timeout: 15000 },
      ...parameters,
    },
    credentials,
  };
}
function workflow(name, nodes) {
  const positioned = nodes.map((n, i) => ({ ...n, id: `native-${i}`, position: [i * 240, 0] }));
  const connections = {};
  for (let i = 0; i < nodes.length - 1; i++)
    connections[nodes[i].name] = { main: [[{ node: nodes[i + 1].name, type: 'main', index: 0 }]] };
  return {
    name,
    active: false,
    nodes: positioned,
    connections,
    settings: {
      executionOrder: 'v1',
      saveDataErrorExecution: 'none',
      saveDataSuccessExecution: 'none',
      saveManualExecutions: false,
    },
  };
}
export function buildNativeTaskWorker() {
  return workflow('TMX — Gestão nativa | Publicador Discord · RASCUNHO', [
    {
      name: 'A cada 15 segundos',
      type: 'n8n-nodes-base.scheduleTrigger',
      typeVersion: 1.2,
      parameters: { rule: { interval: [{ field: 'seconds', secondsInterval: 15 }] } },
    },
    http('Reservar entregas nativas', {
      method: 'POST',
      url: "={{ $vars.TMX_TASK_API_BASE + '/v1/native-task-automation/claim' }}",
    }),
    code('Preparar entregas nativas', prepareNativeDeliveries, 'runOnceForAllItems'),
    {
      ...http(
        'Publicar estado nativo',
        {
          method: '={{ $json.discordMethod }}',
          url: '={{ $json.discordUrl }}',
          sendBody: true,
          specifyBody: 'json',
          jsonBody: '={{ $json.discordBody }}',
          options: {
            timeout: 15000,
            response: {
              response: { fullResponse: true, neverError: true, responseFormat: 'json' },
            },
          },
        },
        discordCredential,
      ),
      onError: 'continueRegularOutput',
      retryOnFail: false,
    },
    code('Conferir recibo nativo', confirmNativeDelivery),
    {
      ...http('Confirmar entrega nativa', {
        method: 'POST',
        url: "={{ $vars.TMX_TASK_API_BASE + '/v1/native-task-automation/result' }}",
        sendBody: true,
        specifyBody: 'json',
        jsonBody: '={{ $json }}',
      }),
      retryOnFail: true,
      maxTries: 3,
      waitBetweenTries: 1000,
    },
  ]);
}
export function buildNativeTaskActions() {
  return workflow('TMX — Gestão nativa | Botões Discord · RASCUNHO', [
    {
      name: 'Do gateway Discord autenticado',
      type: 'n8n-nodes-base.executeWorkflowTrigger',
      typeVersion: 1.1,
      parameters: { inputSource: 'passthrough' },
    },
    code('Ler ação nativa', prepareNativeInteraction, 'runOnceForAllItems'),
    http('Salvar status no TMX', {
      method: 'POST',
      url: "={{ $vars.TMX_TASK_API_BASE + '/v1/native-task-automation/interaction' }}",
      sendBody: true,
      specifyBody: 'json',
      jsonBody: '={{ $json }}',
    }),
  ]);
}

export const prepareNativeTaskCreate = String.raw`
const event=$('Do gateway de criação autenticado').item.json;
const message=event.message;
if(!/^\d+$/.test(String(message?.id||''))||!/^\d+$/.test(String(message?.author?.id||'')))throw new Error('Identidade de criação Discord inválida');
const input=event.task;
if(!input||!Array.isArray(input.assigneeDiscordIds)||!input.assigneeDiscordIds.length)throw new Error('Tarefa normalizada sem responsáveis');
const people=$input.first().json.people;
const assigneeIds=input.assigneeDiscordIds.map(id=>{
 const person=people.find(p=>p.discordId===String(id));if(!person)throw new Error('Responsável sem conta TMX vinculada');return person.id;
});
if(new Set(assigneeIds).size!==assigneeIds.length)throw new Error('Responsável duplicado');
const {assigneeDiscordIds:_ids,...fields}=input;
return [{json:{messageId:String(message.id),actorDiscordId:String(message.author.id),task:{...fields,assigneeIds}}}];`;
export function buildNativeTaskCreate() {
  return workflow('TMX — Gestão nativa | Criar pelo Discord · RASCUNHO', [
    {
      name: 'Do gateway de criação autenticado',
      type: 'n8n-nodes-base.executeWorkflowTrigger',
      typeVersion: 1.1,
      parameters: { inputSource: 'passthrough' },
    },
    http('Ler pessoas TMX', {
      method: 'GET',
      url: "={{ $vars.TMX_TASK_API_BASE + '/v1/native-task-automation/people' }}",
    }),
    code('Preparar criação nativa', prepareNativeTaskCreate, 'runOnceForAllItems'),
    http('Criar demanda no TMX', {
      method: 'POST',
      url: "={{ $vars.TMX_TASK_API_BASE + '/v1/native-task-automation/create' }}",
      sendBody: true,
      specifyBody: 'json',
      jsonBody: '={{ $json }}',
    }),
  ]);
}
