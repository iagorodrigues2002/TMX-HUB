import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function intakeHint(input, channelId) {
  const envelope = input?.body ?? input;
  const event = envelope?.d ?? envelope?.data ?? envelope;
  const messageId = String(event?.id ?? event?.message_id ?? event?.messageId ?? '');
  const incomingChannel = String(event?.channel_id ?? event?.channelId ?? '');
  if (!/^\d{15,22}$/.test(messageId) || incomingChannel !== channelId) return null;
  // An unauthenticated wake-up is not an authority. Only these two lookup keys survive.
  return { messageId, channelId };
}

export function normalizeVerifiedMessage(message, hint, people, config, now = Date.now()) {
  const normalize = (value) =>
    String(value ?? '')
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .trim()
      .toLowerCase();
  if (
    !message ||
    message.id !== hint.messageId ||
    message.channel_id !== hint.channelId ||
    hint.channelId !== config.intakeChannelId
  )
    throw new Error('discord_message_mismatch');
  if (
    message.author?.bot ||
    message.webhook_id ||
    !/^\d{15,22}$/.test(String(message.author?.id ?? ''))
  )
    throw new Error('discord_actor_invalid');
  const received = Date.parse(message.timestamp);
  const notBefore = Date.parse(config.notBefore);
  if (!Number.isFinite(notBefore) || received < notBefore)
    throw new Error('discord_message_before_native_cutover');
  if (!Number.isFinite(received) || now - received > 15 * 60_000 || received - now > 60_000)
    throw new Error('discord_message_not_recent');
  const content = String(message.content ?? '');
  if (content.length > 12_000) throw new Error('task_form_too_large');
  const allowed = new Set([
    'tarefa',
    'setor',
    'responsavel',
    'oferta',
    'prazo',
    'prioridade',
    'descricao',
  ]);
  const fields = {};
  let current = '';
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([^:]+):\s*(.*)$/);
    const key = match ? normalize(match[1].replace(/\*/g, '')) : '';
    if (allowed.has(key)) {
      if (Object.hasOwn(fields, key)) throw new Error('duplicate_task_field');
      fields[key] = match[2].replace(/^\*\*\s*/, '').trim();
      current = key;
    } else if (current && line.trim()) fields[current] += `\n${line.trim()}`;
  }
  if (!fields.tarefa || fields.tarefa.length < 3 || fields.tarefa.length > 200)
    throw new Error('task_title_invalid');
  const sectors = {
    infraestrutura: 'Infraestrutura',
    trafego: 'Tráfego',
    'funil & desenvolvimento': 'Funil & Desenvolvimento',
    'funil e desenvolvimento': 'Funil & Desenvolvimento',
    spy: 'Spy',
  };
  const sector = sectors[normalize(fields.setor)];
  if (!sector) throw new Error('task_sector_invalid');
  const names = String(fields.responsavel ?? '')
    .split(/\s*(?:,|&|\/|\be\b)\s*/)
    .map((x) => x.trim())
    .filter(Boolean);
  if (!names.length || names.length > 20) throw new Error('task_assignees_required');
  const assigneeIds = names.map((name) => {
    const mention = name.match(/^<@!?(\d{15,22})>$/)?.[1];
    const alias = config.aliases?.[normalize(name)];
    const candidates = people.filter(
      (p) =>
        p.userId &&
        p.discordId &&
        (mention || alias
          ? p.discordId === (mention || alias)
          : normalize(p.name) === normalize(name)),
    );
    if (candidates.length !== 1) throw new Error('task_assignee_not_uniquely_linked');
    return candidates[0].id;
  });
  const unique = [...new Set(assigneeIds)];
  if (unique.length !== assigneeIds.length) throw new Error('duplicate_task_assignee');
  let dueAt = null;
  if (fields.prazo && normalize(fields.prazo) !== 'sem prazo') {
    const m = fields.prazo.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) throw new Error('task_deadline_invalid');
    const [, d, mo, y] = m;
    const check = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
    if (
      check.getUTCFullYear() !== Number(y) ||
      check.getUTCMonth() + 1 !== Number(mo) ||
      check.getUTCDate() !== Number(d)
    )
      throw new Error('task_deadline_invalid');
    dueAt = new Date(`${y}-${mo}-${d}T23:59:59-03:00`).toISOString();
  }
  const priorities = { urgente: 'urgent', alta: 'high', normal: 'normal', baixa: 'low' };
  const priority = priorities[normalize(fields.prioridade || 'normal')];
  if (!priority) throw new Error('task_priority_invalid');
  const description = fields.descricao || '';
  if (description.length > 10_000) throw new Error('task_description_too_large');
  const offer = !fields.oferta || normalize(fields.oferta) === 'sem oferta' ? null : fields.oferta;
  if (offer && offer.length > 100) throw new Error('task_offer_invalid');
  return {
    messageId: message.id,
    actorDiscordId: message.author.id,
    task: {
      companyId: config.companyId,
      title: fields.tarefa,
      description,
      sector,
      offer,
      assigneeIds: unique,
      priority,
      dueAt,
    },
  };
}

export async function validateSignedInteraction(headers, raw, publicKeyHex, now = Date.now()) {
  const reject = (code, error) => ({
    responseCode: code,
    responseBody: { error },
    needsUpdate: false,
  });
  const signature = String(headers?.['x-signature-ed25519'] ?? '');
  const timestamp = String(headers?.['x-signature-timestamp'] ?? '');
  if (
    !Buffer.isBuffer(raw) ||
    !/^[0-9a-f]{128}$/i.test(signature) ||
    !/^\d{10}$/.test(timestamp) ||
    !/^[0-9a-f]{64}$/i.test(publicKeyHex)
  )
    return reject(401, 'invalid request signature');
  const age = now / 1000 - Number(timestamp);
  if (age > 300 || age < -60) return reject(401, 'expired request signature');
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      Buffer.from(publicKeyHex, 'hex'),
      { name: 'Ed25519' },
      false,
      ['verify'],
    );
    if (
      !(await crypto.subtle.verify(
        'Ed25519',
        key,
        Buffer.from(signature, 'hex'),
        Buffer.concat([Buffer.from(timestamp), raw]),
      ))
    )
      return reject(401, 'invalid request signature');
  } catch {
    return reject(401, 'invalid request signature');
  }
  let event;
  try {
    event = JSON.parse(raw.toString('utf8'));
  } catch {
    return reject(400, 'invalid json');
  }
  if (event.type === 1) return { responseCode: 200, responseBody: { type: 1 }, needsUpdate: false };
  if (event.type !== 3) return reject(400, 'unsupported interaction');
  const customId = String(event.data?.custom_id ?? '');
  if (/^tmx_status\|/.test(customId))
    return {
      responseCode: 200,
      responseBody: {
        type: 4,
        data: {
          content:
            'Este card pertence ao histórico anterior. Novas tarefas são gerenciadas no TMX.',
          flags: 64,
        },
      },
      needsUpdate: false,
    };
  const match = customId.match(
    /^tmx:native:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):([1-9][0-9]*):(pending|progress|done)$/i,
  );
  const actor = event.member?.user?.id ?? event.user?.id;
  const ids = [event.id, actor, event.message?.id, event.channel_id, event.application_id];
  if (
    !match ||
    !ids.every((id) => /^\d{15,22}$/.test(String(id ?? ''))) ||
    !Number.isSafeInteger(Number(match[2]))
  )
    return reject(400, 'invalid component');
  const token = String(event.token ?? '');
  if (!/^[A-Za-z0-9._-]{10,300}$/.test(token)) return reject(400, 'invalid interaction token');
  return {
    responseCode: 200,
    responseBody: { type: 6 },
    needsUpdate: true,
    apiBody: {
      interactionId: String(event.id),
      taskId: match[1],
      actorDiscordId: String(actor),
      messageId: String(event.message.id),
      channelId: String(event.channel_id),
      revision: Number(match[2]),
      status: match[3],
    },
    applicationId: String(event.application_id),
    interactionToken: token,
  };
}

const clone = (value) => JSON.parse(JSON.stringify(value));
function httpNode(name, parameters, credential, index) {
  return {
    id: `native-${name.replace(/[^A-Za-z0-9]/g, '').toLowerCase()}`,
    name,
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: [index * 240, 0],
    parameters: { ...parameters, options: { timeout: 15000, ...(parameters.options || {}) } },
    ...(credential ? { credentials: credential } : {}),
  };
}
function codeNode(name, code, index, mode = 'runOnceForAllItems') {
  return {
    id: `native-${name.replace(/[^A-Za-z0-9]/g, '').toLowerCase()}`,
    name,
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [index * 240, 0],
    parameters: { mode, jsCode: code },
  };
}
function sequential(names) {
  return Object.fromEntries(
    names
      .slice(0, -1)
      .map((name, i) => [name, { main: [[{ node: names[i + 1], type: 'main', index: 0 }]] }]),
  );
}
function baseWorkflow(existing) {
  const { staticData, pinData, activeVersion, activeVersionId, versionId, shared, ...rest } =
    clone(existing);
  return {
    ...rest,
    active: false,
    pinData: {},
    settings: { ...rest.settings, saveDataErrorExecution: 'all', saveDataSuccessExecution: 'none' },
  };
}

export function buildArtifacts(config, templates, intake, interactions) {
  if (
    !/^https:\/\/[A-Za-z0-9.-]+$/.test(config.apiBase) ||
    !/^https:\/\/[A-Za-z0-9.-]+$/.test(config.webBase)
  )
    throw new Error('static_https_bases_required');
  if (!/^[0-9a-f-]{36}$/.test(config.companyId) || !/^\d{15,22}$/.test(config.intakeChannelId))
    throw new Error('scope_configuration_invalid');
  if (!Number.isFinite(Date.parse(config.notBefore)))
    throw new Error('explicit_native_cutover_timestamp_required');
  const tmxCredential = { httpHeaderAuth: config.tmxCredential };
  const discordCredential = { discordBotApi: config.discordCredential };
  const apiHttp = { authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth' };
  const botHttp = {
    authentication: 'predefinedCredentialType',
    nodeCredentialType: 'discordBotApi',
  };
  const artifacts = {};
  for (const [key, original] of Object.entries(templates)) {
    const workflow = baseWorkflow(original);
    workflow.name = original.name.replace(' · RASCUNHO', ' · Nativo preparado');
    for (const node of workflow.nodes) {
      if (node.credentials?.httpHeaderAuth) node.credentials = clone(tmxCredential);
      if (node.credentials?.discordBotApi) node.credentials = clone(discordCredential);
      if (node.parameters.url)
        node.parameters.url = node.parameters.url.replace(
          '$vars.TMX_TASK_API_BASE',
          JSON.stringify(config.apiBase),
        );
      if (node.parameters.jsCode)
        node.parameters.jsCode = node.parameters.jsCode.replaceAll(
          '$vars.TMX_TASK_WEB_BASE',
          JSON.stringify(config.webBase),
        );
    }
    artifacts[key] = workflow;
  }
  const intakeW = baseWorkflow(intake);
  intakeW.name = 'TMX — Discord → TMX | Processador nativo seguro';
  const trigger = clone(intake.nodes.find((n) => n.type === 'n8n-nodes-base.webhook'));
  trigger.parameters.responseMode = 'onReceived';
  const hint = codeNode(
    'Validar chave de consulta',
    `${intakeHint.toString()}\nconst hint=intakeHint($input.first().json,${JSON.stringify(config.intakeChannelId)});return hint?[{json:hint}]:[];`,
    1,
  );
  const message = httpNode(
    'Consultar mensagem real no Discord',
    {
      method: 'GET',
      ...botHttp,
      url: "={{ 'https://discord.com/api/v10/channels/' + $json.channelId + '/messages/' + $json.messageId }}",
      options: { response: { response: { responseFormat: 'json' } } },
    },
    discordCredential,
    2,
  );
  const people = httpNode(
    'Consultar pessoas vinculadas no TMX',
    { method: 'GET', ...apiHttp, url: `${config.apiBase}/v1/native-task-automation/people` },
    tmxCredential,
    3,
  );
  const parse = codeNode(
    'Preparar tarefa da mensagem verificada',
    `${normalizeVerifiedMessage.toString()}\nconst hint=$('Validar chave de consulta').first().json;const message=$('Consultar mensagem real no Discord').first().json;const people=$input.first().json.people;if(!Array.isArray(people))throw new Error('invalid_tmx_people_response');return [{json:normalizeVerifiedMessage(message,hint,people,${JSON.stringify({ companyId: config.companyId, intakeChannelId: config.intakeChannelId, aliases: config.aliases, notBefore: config.notBefore })})}];`,
    4,
  );
  const create = httpNode(
    'Criar tarefa nativa idempotente',
    {
      method: 'POST',
      ...apiHttp,
      url: `${config.apiBase}/v1/native-task-automation/create`,
      sendBody: true,
      specifyBody: 'json',
      jsonBody: '={{ $json }}',
    },
    tmxCredential,
    5,
  );
  create.retryOnFail = true;
  create.maxTries = 3;
  create.waitBetweenTries = 1000;
  const reaction = httpNode(
    'Confirmar recebimento na mensagem original',
    {
      method: 'PUT',
      ...botHttp,
      url: "={{ 'https://discord.com/api/v10/channels/' + $('Validar chave de consulta').first().json.channelId + '/messages/' + $('Validar chave de consulta').first().json.messageId + '/reactions/%E2%9C%85/@me' }}",
      options: {
        response: { response: { fullResponse: true, neverError: true, responseFormat: 'text' } },
      },
    },
    discordCredential,
    6,
  );
  reaction.onError = 'continueRegularOutput';
  intakeW.nodes = [trigger, hint, message, people, parse, create, reaction];
  intakeW.connections = sequential(intakeW.nodes.map((n) => n.name));
  artifacts.intake = intakeW;

  const interactionsW = baseWorkflow(interactions);
  interactionsW.name = 'TMX — Discord Interactions | Status nativo seguro';
  const hook = clone(interactions.nodes.find((n) => n.type === 'n8n-nodes-base.webhook'));
  hook.parameters.responseMode = 'responseNode';
  hook.parameters.options = { ...hook.parameters.options, rawBody: true };
  const existingCode = interactions.nodes.find((n) => n.name === 'Validar assinatura e interpretar')
    .parameters.jsCode;
  const key = existingCode.match(/const publicKeyHex = ['"]([0-9a-f]{64})['"]/i)?.[1];
  if (!key) throw new Error('existing_discord_public_key_missing');
  const validate = codeNode(
    'Validar assinatura e interpretar',
    `const crypto=require('crypto');\n${validateSignedInteraction.toString()}\nconst item=$input.first();let raw;try{raw=await this.helpers.getBinaryDataBuffer(0,'data');}catch{}return [{json:await validateSignedInteraction(item.json.headers,raw,${JSON.stringify(key)})}];`,
    1,
  );
  const respond = clone(
    interactions.nodes.find((n) => n.type === 'n8n-nodes-base.respondToWebhook'),
  );
  respond.parameters = {
    respondWith: 'json',
    responseBody: '={{ $json.responseBody }}',
    options: { responseCode: '={{ $json.responseCode }}' },
  };
  const onlyNative = codeNode(
    'Somente clique nativo validado',
    "const state=$('Validar assinatura e interpretar').first().json;return state.needsUpdate?[{json:state.apiBody}]:[];",
    3,
  );
  const update = httpNode(
    'Atualizar tarefa no TMX',
    {
      method: 'POST',
      ...apiHttp,
      url: `${config.apiBase}/v1/native-task-automation/interaction`,
      sendBody: true,
      specifyBody: 'json',
      jsonBody: '={{ $json }}',
      options: {
        response: { response: { fullResponse: true, neverError: true, responseFormat: 'json' } },
      },
    },
    tmxCredential,
    4,
  );
  update.onError = 'continueRegularOutput';
  const failures = codeNode(
    'Informar falha apenas ao autor',
    "const response=$input.first().json;if(Number(response.statusCode)>=200&&Number(response.statusCode)<300)return [];const state=$('Validar assinatura e interpretar').first().json;const code=Number(response.statusCode);const content=code===409?'Este card foi atualizado por outra pessoa. Aguarde a atualização e tente novamente.':code===403||code===404?'Não foi possível atualizar: confira seu acesso à empresa e à tarefa.':'Não foi possível confirmar a atualização no TMX. Tente novamente em instantes.';return [{json:{url:'https://discord.com/api/v10/webhooks/'+state.applicationId+'/'+state.interactionToken,body:{content,flags:64,allowed_mentions:{parse:[]}}}}];",
    5,
  );
  const feedback = httpNode(
    'Resposta privada de falha no Discord',
    {
      method: 'POST',
      url: '={{ $json.url }}',
      sendBody: true,
      specifyBody: 'json',
      jsonBody: '={{ $json.body }}',
    },
    null,
    6,
  );
  interactionsW.nodes = [hook, validate, respond, onlyNative, update, failures, feedback];
  interactionsW.connections = sequential(interactionsW.nodes.map((n) => n.name));
  artifacts.interactions = interactionsW;
  return artifacts;
}

export function writeArtifacts(directory, artifacts) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  for (const [name, workflow] of Object.entries(artifacts))
    fs.writeFileSync(
      path.join(directory, `${name}.json`),
      `${JSON.stringify(workflow, null, 2)}\n`,
      { mode: 0o600 },
    );
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  const [configPath, project, intakePath, interactionsPath, output] = process.argv.slice(2);
  if (![configPath, project, intakePath, interactionsPath, output].every(Boolean))
    throw new Error(
      'Usage: node native-cutover.mjs config.json project intake.json interactions.json output',
    );
  const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
  const templates = Object.fromEntries(
    ['worker', 'create', 'actions'].map((kind) => [
      kind,
      read(path.join(project, `automations/n8n-native-task-${kind}.json`)),
    ]),
  );
  const artifacts = buildArtifacts(
    read(configPath),
    templates,
    read(intakePath),
    read(interactionsPath),
  );
  writeArtifacts(output, artifacts);
  console.log(`Prepared ${Object.keys(artifacts).length} inactive workflows. No remote writes.`);
}
