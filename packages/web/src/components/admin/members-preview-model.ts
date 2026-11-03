import { z } from 'zod';

export const modules = [
  'Vídeo Studio',
  'Rastreamento',
  'Upsell Intelligence',
  'Ads Inteligente',
  'Financeiro',
  'Tarefas e calls',
] as const;
export const roles = ['Dono', 'Sócio', 'Administrador da empresa', 'Colaborador'] as const;
export const previewOffers = ['PJR_ENG', 'PJR_ESP', 'SLM_DE'].map((name) => ({
  id: `demo-${name}`,
  name,
  companyId: 'tmx',
}));
export const moduleDescriptions: Record<string, string> = {
  'Vídeo Studio': 'Criar e editar seus projetos de vídeo.',
  Rastreamento: 'Consultar jornada, captura e resultados das ofertas liberadas.',
  'Upsell Intelligence': 'Operar a recuperação de upsells nas ofertas liberadas.',
  'Ads Inteligente': 'Analisar anúncios, gastos e desempenho.',
  Financeiro: 'Consultar receitas, devoluções e reservas das ofertas liberadas.',
  'Tarefas e calls': 'Acompanhar tarefas atribuídas e calls em que participa.',
};
export type Member = {
  id: string;
  name: string;
  global: boolean;
  companyId: string | null;
  role: (typeof roles)[number] | null;
  job: string;
  access: 'complete' | 'team' | 'studio';
  pendingCompany: boolean;
  modules: string[];
  offers: 'all' | 'selected';
  offerIds?: string[];
};
export type Company = { id: string; name: string; illustrative?: boolean };
export type Invitation = {
  id: string;
  name: string;
  email: string;
  path: 'company' | 'team' | 'studio';
  companyId: string | null;
  role: 'Colaborador' | 'Administrador da empresa';
};
export type MembersPreviewState = {
  members: Member[];
  companies: Company[];
  invitations: Invitation[];
};
export function initialMembersPreview(): MembersPreviewState {
  const member = (id: string, name: string, patch: Partial<Member> = {}): Member => ({
    id,
    name,
    global: false,
    companyId: null,
    role: null,
    job: 'Vídeo Studio',
    access: 'studio',
    pendingCompany: false,
    modules: ['Vídeo Studio'],
    offers: 'selected',
    ...patch,
  });
  return {
    companies: [
      { id: 'tmx', name: 'TMX' },
      { id: 'yola-company', name: 'Empresa da Yola', illustrative: true },
    ],
    invitations: [],
    members: [
      member('iago', 'Iago Rodrigues', {
        global: true,
        companyId: 'tmx',
        role: 'Dono',
        job: 'Gestão',
        access: 'complete',
        modules: [...modules],
        offers: 'all',
      }),
      member('lucas', 'Lucas Gomes', {
        global: true,
        companyId: 'tmx',
        role: 'Sócio',
        job: 'Gestão',
        access: 'complete',
        modules: [...modules],
        offers: 'all',
      }),
      member('douglas', 'Douglas Riti', {
        companyId: 'tmx',
        role: 'Colaborador',
        job: 'Recuperação',
        access: 'team',
        modules: ['Upsell Intelligence', 'Tarefas e calls'],
      }),
      member('yola', 'Yola', {
        companyId: 'yola-company',
        role: 'Dono',
        job: 'Gestão',
        access: 'complete',
        modules: [...modules],
        offers: 'all',
      }),
      ...[
        ['gabriel-pinto', 'Gabriel Pinto'],
        ['enzo', 'Enzo Iran'],
      ].map(([id, name]) =>
        member(id!, name!, {
          role: 'Dono',
          job: 'Gestão',
          access: 'complete',
          pendingCompany: true,
          modules: [...modules],
          offers: 'all',
        }),
      ),
      ...[
        'Pedro Torres',
        'Gabriel Pedrosa',
        'Maria Regina',
        'Guilherme Neves',
        'Pedro Coimbra',
        'Gustavo',
        'Gabriel Barboza',
        'Ruan',
        'Leonardo Xavier',
        'Gabriel Martini',
        'Ender',
      ].map((name, i) => member(`studio-${i}`, name)),
    ],
  };
}
const invitationSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().trim().min(2).max(100),
    email: z
      .string()
      .trim()
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
    path: z.enum(['company', 'team', 'studio']),
    companyId: z.string().nullable(),
    role: z.enum(['Colaborador', 'Administrador da empresa']),
  })
  .strict();
export function addPreviewInvitation(
  state: MembersPreviewState,
  input: Invitation,
): MembersPreviewState {
  const invite = invitationSchema.parse(input);
  if (state.invitations.some((i) => i.id === invite.id))
    throw Error('Este convite demonstrativo já existe.');
  if (state.invitations.some((i) => i.email === invite.email))
    throw Error('Já existe um convite demonstrativo para esse e-mail.');
  if (invite.path === 'team' && !state.companies.some((c) => c.id === invite.companyId))
    throw Error('Selecione uma empresa existente.');
  return {
    ...state,
    invitations: [
      { ...invite, companyId: invite.path === 'team' ? invite.companyId : null },
      ...state.invitations,
    ],
  };
}
export function createPreviewCompany(
  state: MembersPreviewState,
  memberId: string,
  rawName: string,
): MembersPreviewState {
  const person = state.members.find((m) => m.id === memberId);
  if (!person?.pendingCompany || person.companyId || person.access !== 'complete')
    throw Error('Esta pessoa não precisa criar uma empresa.');
  const name = rawName.trim();
  if (name.length < 2 || name.length > 80) throw Error('Use um nome entre 2 e 80 caracteres.');
  if (
    state.companies.some(
      (c) => c.name.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'),
    )
  )
    throw Error('Esta empresa já existe na demonstração.');
  const id = `company-${memberId}`;
  return {
    ...state,
    companies: [...state.companies, { id, name }],
    members: state.members.map((m) =>
      m.id === memberId ? { ...m, companyId: id, pendingCompany: false } : m,
    ),
  };
}
const accessPatchSchema = z
  .object({
    role: z.enum(['Colaborador', 'Administrador da empresa']),
    job: z.string().trim().max(80),
    modules: z.array(z.enum(modules)),
    offers: z.enum(['all', 'selected']),
    offerIds: z.array(z.string().min(1)).optional(),
  })
  .strict();

export function savePreviewAccess(
  state: MembersPreviewState,
  id: string,
  input: Pick<Member, 'role' | 'job' | 'modules' | 'offers' | 'offerIds'>,
): MembersPreviewState {
  const current = state.members.find((m) => m.id === id);
  if (
    !current ||
    current.global ||
    current.role === 'Dono' ||
    current.pendingCompany ||
    current.access === 'studio'
  )
    throw Error('Este perfil tem acessos definidos pelo tipo de vínculo.');
  const parsed = accessPatchSchema.safeParse(input);
  if (!parsed.success) throw Error('Permissões inválidas.');
  const patch = parsed.data;
  if (
    (patch.offerIds ?? []).some(
      (id) => !previewOffers.some((o) => o.id === id && o.companyId === current.companyId),
    )
  )
    throw Error('Selecione somente ofertas desta empresa.');
  return {
    ...state,
    members: state.members.map((m) =>
      m.id === id
        ? {
            ...m,
            role: patch.role,
            job: patch.job.trim().slice(0, 80),
            modules:
              patch.role === 'Administrador da empresa'
                ? [...modules]
                : [...new Set(patch.modules)],
            offers: patch.role === 'Administrador da empresa' ? 'all' : patch.offers,
            offerIds:
              patch.role === 'Administrador da empresa' || patch.offers === 'all'
                ? []
                : [...new Set(patch.offerIds ?? [])],
          }
        : m,
    ),
  };
}
export function filterPreviewMembers(state: MembersPreviewState, query: string, group: string) {
  const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  return state.members.filter(
    (m) =>
      (group === 'all' ||
        (group === 'global' && m.global) ||
        (group === 'tmx' && m.companyId === 'tmx') ||
        (group === 'companies' && m.access === 'complete' && !m.global) ||
        (group === 'studio' && m.access === 'studio')) &&
      fold(
        `${m.name} ${m.job} ${state.companies.find((c) => c.id === m.companyId)?.name ?? ''}`,
      ).includes(fold(query.trim())),
  );
}
