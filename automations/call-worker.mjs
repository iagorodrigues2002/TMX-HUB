export const prepareCommand = `
const config=JSON.parse($vars.TMX_CALL_CONFIG_JSON||'{}');
if(!/^\\d+$/.test(String(config.listId||'')) || !/^\\d+$/.test(String(config.channelId||''))) throw new Error('Configure lista e canal reais');
return $input.first().json.commands.map(command=>{
 const call=command.call;
 if(!call.participants.length || call.participants.some(p=>!/^\\d+$/.test(p.clickupId)||!/^\\d+$/.test(p.discordId))) throw new Error('Todos os participantes precisam de vínculo confirmado');
 const status=config.statuses?.[call.status];
 if(!status) throw new Error('Status real da lista não configurado');
 const mentions=call.participants.map(p=>'<@'+p.discordId+'>').join(' ');
 const when=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}).format(new Date(call.startsAt));
 const heading=command.action==='remind'?(command.minutes===0?'A call começa agora':'Call em '+command.minutes+' minutos'):(call.status==='cancelled'?'Call cancelada':call.status==='completed'?'Call realizada':'Call agendada');
 const base=['📅 **'+heading+' — '+call.title+'**',when+' · São Paulo · '+call.durationMinutes+' min',mentions].join('\\n');
 const content=[base,call.message.slice(0,Math.max(0,1999-base.length))].filter(Boolean).join('\\n');
 const discordBody={content,allowed_mentions:{parse:[],users:call.participants.map(p=>p.discordId)},components:call.status==='scheduled'?[{type:1,components:[{type:2,style:5,label:'Entrar na call',url:call.meetingUrl}]}]:[]};
 if(command.action==='remind'||!call.discordMessageId){discordBody.nonce=String(command.id).slice(-25);discordBody.enforce_nonce=true;}
 const clickupBody={name:call.title,description:call.description+'\\n\\nTMX call '+call.id+' revision '+call.revision+'\\n'+call.meetingUrl,status,assignees:call.participants.map(p=>Number(p.clickupId)),due_date:Date.parse(call.startsAt),due_date_time:true,start_date:Date.parse(call.startsAt),start_date_time:true};
 if(call.clickupId) clickupBody.assignees={add:call.participants.map(p=>Number(p.clickupId)),rem:[]};
 return {json:{command,config,discordBody,clickupBody,status,discordMethod:command.action==='sync'&&call.discordMessageId?'PATCH':'POST',discordUrl:'https://discord.com/api/v10/channels/'+config.channelId+'/messages'+(command.action==='sync'&&call.discordMessageId?'/'+call.discordMessageId:''),clickupMethod:call.clickupId?'PUT':'POST',clickupUrl:'https://api.clickup.com/api/v2/'+(call.clickupId?'task/'+call.clickupId:'list/'+config.listId+'/task')}};
});`;

export const confirmClickup = `
const input=$('Preparar calls').item.json;const remote=$input.item.json;
if(!remote.id || (input.command.call.clickupId && String(remote.id)!==input.command.call.clickupId)) throw new Error('ClickUp não confirmou identidade');
const expected=input.command.call.participants.map(p=>p.clickupId).sort();const actual=(remote.assignees||[]).map(p=>String(p.id)).sort();
if(JSON.stringify(expected)!==JSON.stringify(actual)||remote.status?.status!==input.status||Number(remote.due_date)!==Date.parse(input.command.call.startsAt)) throw new Error('ClickUp não confirmou participantes, horário ou status');
return {json:{...input,clickupId:String(remote.id)}};`;

export const prepareExisting = `
const input=$('Preparar calls').item.json;const remote=$input.item.json;
if(String(remote.id)!==input.command.call.clickupId) throw new Error('Outra tarefa retornada');
const wanted=input.command.call.participants.map(p=>p.clickupId);
input.clickupBody.assignees={add:wanted.map(Number),rem:(remote.assignees||[]).map(p=>String(p.id)).filter(id=>!wanted.includes(id)).map(Number)};
return {json:input};`;

export const confirmDiscord = `
const input=$('Preparar calls').item.json;const receipt=$input.item.json;
if(!/^\\d+$/.test(String(receipt.id||'')) || String(receipt.channel_id)!==String(input.config.channelId)) throw new Error('Discord não confirmou mensagem');
if(input.discordMethod==='PATCH'&&String(receipt.id)!==input.command.call.discordMessageId) throw new Error('Discord retornou outro card');
let clickupId=input.command.call.clickupId;
if(input.command.action==='sync') clickupId=$('Conferir ClickUp').item.json.clickupId;
return {json:{id:input.command.id,revision:input.command.call.revision,ok:true,clickupId,discordMessageId:String(receipt.id),discordChannelId:String(receipt.channel_id)}};`;

export function buildCallWorkflow() {
  const header = {
    httpHeaderAuth: { id: 'CONFIGURE_TMX_TASK_HEADER_AUTH', name: 'TMX Tasks API' },
  };
  const http = (name, parameters, credentials = header) => ({
    name,
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: [0, 0],
    parameters: {
      authentication: credentials === header ? 'genericCredentialType' : 'predefinedCredentialType',
      ...(credentials === header
        ? { genericAuthType: 'httpHeaderAuth' }
        : { nodeCredentialType: Object.keys(credentials)[0] }),
      options: { timeout: 15000 },
      ...parameters,
    },
    credentials,
  });
  const code = (name, jsCode, mode = 'runOnceForEachItem') => ({
    name,
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [0, 0],
    parameters: { jsCode, mode },
  });
  const nodes = [
    {
      name: 'A cada 30 segundos',
      type: 'n8n-nodes-base.scheduleTrigger',
      typeVersion: 1.2,
      position: [0, 0],
      parameters: { rule: { interval: [{ field: 'seconds', secondsInterval: 30 }] } },
    },
    http('Reservar calls', {
      method: 'POST',
      url: "={{ $vars.TMX_TASK_API_BASE + '/v1/call-automation/claim' }}",
    }),
    code('Preparar calls', prepareCommand, 'runOnceForAllItems'),
    {
      name: 'É lembrete?',
      type: 'n8n-nodes-base.if',
      typeVersion: 2.2,
      position: [0, 0],
      parameters: {
        conditions: {
          options: { caseSensitive: true, typeValidation: 'strict', version: 2 },
          conditions: [
            {
              leftValue: '={{ $json.command.action }}',
              rightValue: 'remind',
              operator: { type: 'string', operation: 'equals' },
            },
          ],
          combinator: 'and',
        },
      },
    },
    {
      name: 'Já existe no ClickUp?',
      type: 'n8n-nodes-base.if',
      typeVersion: 2.2,
      position: [0, 0],
      parameters: {
        conditions: {
          options: { caseSensitive: true, typeValidation: 'strict', version: 2 },
          conditions: [
            {
              leftValue: '={{ !!$json.command.call.clickupId }}',
              rightValue: true,
              operator: { type: 'boolean', operation: 'true', singleValue: true },
            },
          ],
          combinator: 'and',
        },
      },
    },
    http(
      'Ler participantes atuais',
      {
        method: 'GET',
        url: "={{ 'https://api.clickup.com/api/v2/task/' + $json.command.call.clickupId }}",
      },
      { clickUpApi: { id: 'CONFIGURE_CLICKUP', name: 'Mainex Clickup' } },
    ),
    code('Preparar participantes atuais', prepareExisting),
    http(
      'Gravar ClickUp',
      {
        method: '={{ $json.clickupMethod }}',
        url: '={{ $json.clickupUrl }}',
        sendBody: true,
        specifyBody: 'json',
        jsonBody: '={{ $json.clickupBody }}',
      },
      { clickUpApi: { id: 'CONFIGURE_CLICKUP', name: 'Mainex Clickup' } },
    ),
    http(
      'Reler ClickUp',
      { method: 'GET', url: "={{ 'https://api.clickup.com/api/v2/task/' + $json.id }}" },
      { clickUpApi: { id: 'CONFIGURE_CLICKUP', name: 'Mainex Clickup' } },
    ),
    code('Conferir ClickUp', confirmClickup),
    http('Guardar identidade ClickUp', {
      method: 'POST',
      url: "={{ $vars.TMX_TASK_API_BASE + '/v1/call-automation/checkpoint' }}",
      sendBody: true,
      specifyBody: 'json',
      jsonBody:
        '={{ { id: $json.command.id, revision: $json.command.call.revision, clickupId: $json.clickupId } }}',
    }),
    http(
      'Publicar ou atualizar card',
      {
        method: "={{ $('Preparar calls').item.json.discordMethod }}",
        url: "={{ $('Preparar calls').item.json.discordUrl }}",
        sendBody: true,
        specifyBody: 'json',
        jsonBody: "={{ $('Preparar calls').item.json.discordBody }}",
      },
      { discordBotApi: { id: 'CONFIGURE_DISCORD', name: 'Mainex Bot - TMX' } },
    ),
    code('Conferir Discord', confirmDiscord),
    http('Confirmar entrega', {
      method: 'POST',
      url: "={{ $vars.TMX_TASK_API_BASE + '/v1/call-automation/result' }}",
      sendBody: true,
      specifyBody: 'json',
      jsonBody: '={{ $json }}',
    }),
  ].map((n, i) => ({ ...n, id: `call-${i}`, position: [i * 230, 0] }));
  const connections = {};
  const edge = (from, to, index = 0) => {
    connections[from] ??= { main: [] };
    connections[from].main[index] = [{ node: to, type: 'main', index: 0 }];
  };
  edge('A cada 30 segundos', 'Reservar calls');
  edge('Reservar calls', 'Preparar calls');
  edge('Preparar calls', 'É lembrete?');
  edge('É lembrete?', 'Publicar ou atualizar card');
  edge('É lembrete?', 'Já existe no ClickUp?', 1);
  edge('Já existe no ClickUp?', 'Ler participantes atuais');
  edge('Já existe no ClickUp?', 'Gravar ClickUp', 1);
  edge('Ler participantes atuais', 'Preparar participantes atuais');
  edge('Preparar participantes atuais', 'Gravar ClickUp');
  edge('Gravar ClickUp', 'Reler ClickUp');
  edge('Reler ClickUp', 'Conferir ClickUp');
  edge('Conferir ClickUp', 'Guardar identidade ClickUp');
  edge('Guardar identidade ClickUp', 'Publicar ou atualizar card');
  edge('Publicar ou atualizar card', 'Conferir Discord');
  edge('Conferir Discord', 'Confirmar entrega');
  return {
    name: 'TMX — Calls | Agendamentos e lembretes',
    active: false,
    nodes,
    connections,
    settings: { timezone: 'America/Sao_Paulo' },
  };
}
