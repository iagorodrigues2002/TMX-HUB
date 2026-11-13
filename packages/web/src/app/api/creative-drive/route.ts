import {
  creativeDeliveryAssessment,
  hasCreativeDeliveryCoverage,
} from '@/components/traffic/creative-workspace-model';
import type { RealCampaignSnapshot } from '@/components/traffic/real-campaigns-model';
import {
  classifyCreativeMetadata,
  configureCreativeDrive,
  creativeDriveState,
  creativeOwner,
  updateCreativeMetadata,
} from '@/lib/creative-drive-store';
import { CREATIVE_HISTORY_START } from '@/lib/creative-identity';
import { todayIso } from '@/lib/date-range';
import { creativeDriveAction } from '@page-cloner/shared/creative-drive-state';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
async function authorize(req: NextRequest) {
  if (
    process.env.NEXT_PUBLIC_TMX_LOCAL_PREVIEW_KIND !== 'synthetic' ||
    req.nextUrl.host !== 'localhost:3120'
  )
    throw Error('Disponível apenas na prévia local.');
  const authorization = req.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) throw Error('Entre na prévia local.');
  const response = await fetch('http://127.0.0.1:4110/v1/auth/me', {
    headers: { authorization },
    redirect: 'error',
    cache: 'no-store',
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw Error('Acesso local não autorizado.');
  const { user } = z
    .object({ user: z.object({ id: z.string().min(1).max(100), role: z.literal('admin') }) })
    .parse(await response.json());
  return creativeOwner(user.id);
}
const json = (value: unknown, status = 200) =>
  NextResponse.json(value, { status, headers: { 'Cache-Control': 'private, no-store' } });
export async function GET(req: NextRequest) {
  try {
    return json(await creativeDriveState(await authorize(req)));
  } catch {
    return json({ detail: 'Acesso restrito à administração da prévia local.' }, 403);
  }
}
export async function POST(req: NextRequest) {
  let owner: string;
  try {
    owner = await authorize(req);
  } catch {
    return json({ detail: 'Acesso restrito à administração da prévia local.' }, 403);
  }
  if (req.headers.get('origin') !== 'http://localhost:3120')
    return json({ detail: 'Origem inválida.' }, 403);
  try {
    const body = await req.text();
    if (body.length > 65536) throw Error('Solicitação muito extensa.');
    const input = creativeDriveAction.parse(JSON.parse(body));
    if (input.action !== 'classify' && body.length > 4096)
      throw Error('Solicitação muito extensa.');
    if (input.action === 'classify') {
      const range = { from: CREATIVE_HISTORY_START, to: todayIso() };
      const path = input.personal ? 'traffic/connection/report' : 'campaigns/local-import';
      const query = new URLSearchParams({ ...range, hourly: '0' });
      const response = await fetch(`http://127.0.0.1:4110/v1/meta-control/${path}?${query}`, {
        headers: { authorization: req.headers.get('authorization')! },
        redirect: 'error',
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw Error('Não foi possível consultar o histórico para classificar.');
      const snapshot: RealCampaignSnapshot = await response.json();
      if (!hasCreativeDeliveryCoverage(snapshot, range))
        return json({ detail: 'Aguardando os dados completos para atualizar os alertas.' }, 409);
      let lowRoas: string[] = [];
      const delivering = new Set<string>();
      await classifyCreativeMetadata(
        owner,
        (state) => {
          const assessment = creativeDeliveryAssessment(snapshot, range, state, input.mappings);
          lowRoas = assessment.lowRoas;
          for (const key of assessment.delivering) delivering.add(key);
          return assessment.statuses;
        },
        delivering,
      );
      return json({ lowRoas });
    }
    if (input.action === 'metadata')
      await updateCreativeMetadata(owner, input.key, {
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.principalId ? { principalId: input.principalId } : {}),
      });
    else {
      const rootUrl =
        input.action === 'configure' ? input.rootUrl : (await creativeDriveState(owner)).rootUrl;
      await configureCreativeDrive(owner, rootUrl);
    }
    return json(await creativeDriveState(owner));
  } catch (error) {
    return json(
      {
        detail:
          error instanceof Error && !(error instanceof z.ZodError)
            ? error.message
            : 'Confira os dados enviados.',
      },
      400,
    );
  }
}
