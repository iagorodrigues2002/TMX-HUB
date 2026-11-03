import { randomUUID } from 'node:crypto';
import type { CallCreate, ManagedCall } from '@page-cloner/shared';
import type { Sql } from 'postgres';
import {
  assertOperationCompany,
  participantHasCompanyAccess,
} from '../lib/company-operation-access.js';
import { HttpProblem } from '../lib/problem.js';
import {
  nativeDiscordChannel,
  nativePeople,
  nativeRequest,
  queueNativeDelivery,
} from './native-tasks.js';

const problem = (status: number, code: string, detail: string) =>
  new HttpProblem({ status, code, title: code, detail });
export async function saveNativeCall(
  db: Sql,
  key: string,
  actor: { id: string; admin: boolean },
  action: 'create' | 'update' | 'cancel' | 'complete',
  id: string | null,
  input: CallCreate | { revision: number } | (CallCreate & { revision: number }),
) {
  return nativeRequest(db, key, actor, `call.${action}`, { id, input }, async (tx) => {
    const callId = id ?? randomUUID();
    const [row] =
      await tx`SELECT body FROM managed_calls WHERE id=${callId} AND body->>'managementMode'='native' FOR UPDATE`;
    const previous = row?.body as ManagedCall | undefined;
    await assertOperationCompany(
      tx,
      actor,
      previous?.companyId ?? ('companyId' in input ? input.companyId : null),
    );
    if (previous && 'companyId' in input && input.companyId !== previous.companyId)
      throw problem(409, 'call_company_immutable', 'A empresa da call não pode ser alterada.');
    if (action !== 'create') {
      if (!previous) throw problem(404, 'call_not_found', 'Call nativa não encontrada.');
      if (!('revision' in input) || input.revision !== previous.revision)
        throw problem(409, 'call_revision_conflict', 'A call mudou. Atualize antes de continuar.');
      if (
        (
          await tx`SELECT id FROM managed_native_deliveries WHERE entity_id=${callId} AND state IN ('processing','uncertain') LIMIT 1`
        ).length
      )
        throw problem(
          409,
          'call_busy',
          'Há uma entrega reservada. Confira o envio antes de reagendar ou cancelar.',
        );
    }
    const at = new Date().toISOString();
    let call: ManagedCall;
    if ('participantIds' in input) {
      if (Date.parse(input.startsAt) <= Date.now())
        throw problem(400, 'call_in_past', 'Escolha um horário futuro.');
      const participants = await nativePeople(
        tx,
        input.participantIds,
        previous?.companyId ?? input.companyId,
      );
      const { participantIds: _ids, ...fields } = input;
      call = {
        ...fields,
        companyId: previous?.companyId ?? input.companyId,
        id: callId,
        managementMode: 'native',
        startsAt: new Date(input.startsAt).toISOString(),
        participants,
        revision: (previous?.revision ?? 0) + 1,
        status: 'scheduled',
        clickupId: null,
        discordMessageId: previous?.discordMessageId ?? null,
        discordChannelId: previous?.discordChannelId ?? null,
        syncState: 'synced',
        discordState: 'pending',
        createdAt: previous?.createdAt ?? at,
        updatedAt: at,
      };
    } else
      call = {
        ...previous!,
        revision: previous!.revision + 1,
        status: action === 'cancel' ? 'cancelled' : 'completed',
        updatedAt: at,
        discordState: 'pending',
      };
    await tx`INSERT INTO managed_calls(id,body) VALUES(${callId},${tx.json(call)}) ON CONFLICT(id) DO UPDATE SET body=excluded.body,updated_at=now()`;
    await tx`UPDATE managed_native_deliveries SET state='expired' WHERE entity_kind='reminder' AND entity_id=${callId} AND state IN ('queued','failed')`;
    await queueNativeDelivery(tx, call, 'call');
    if (call.status === 'scheduled')
      for (const minutes of call.reminderMinutes) {
        const due = new Date(Date.parse(call.startsAt) - minutes * 60000);
        const expires = new Date(due.getTime() + 120000);
        if (expires.getTime() < Date.now()) continue;
        const reminderId = `reminder:${call.id}:${call.revision}:${minutes}`;
        await tx`INSERT INTO managed_native_deliveries(id,entity_kind,entity_id,revision,body,target_channel_id,available_at,expires_at)
        VALUES(${reminderId},'reminder',${call.id},${call.revision},${tx.json({ call, minutes })},${nativeDiscordChannel('Calls', null, call.companyId)},${due},${expires}) ON CONFLICT(id) DO NOTHING`;
      }
    return { kind: 'call' as const, id: callId, result: call };
  });
}

export async function processNativeCallNotices(db: Sql) {
  return db.begin(async (tx) => {
    const due =
      await tx`SELECT d.id,d.body,d.revision,c.body AS call FROM managed_native_deliveries d JOIN managed_calls c ON c.id=d.entity_id
      WHERE d.entity_kind='reminder' AND d.available_at<=now() AND d.expires_at>=now()
      AND c.body->>'managementMode'='native' AND c.body->>'status'='scheduled' AND d.revision=(c.body->>'revision')::int
      ORDER BY d.available_at LIMIT 50 FOR UPDATE OF c SKIP LOCKED`;
    for (const row of due) {
      const call = row.call as ManagedCall;
      const body = {
        callId: call.id,
        title: call.title,
        message: call.message,
        startsAt: call.startsAt,
        meetingUrl: call.meetingUrl,
        minutes: row.body.minutes,
      };
      for (const person of call.participants)
        if (person.userId && (await participantHasCompanyAccess(tx, person.userId, call.companyId)))
          await tx`INSERT INTO managed_call_notifications(id,user_id,call_id,revision,body) VALUES(${row.id},${person.userId},${call.id},${call.revision},${tx.json(body)}) ON CONFLICT DO NOTHING`;
    }
    return due.length;
  });
}
