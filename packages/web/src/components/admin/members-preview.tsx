'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/lib/auth-context';
import { useInterfaceEffects } from '@/lib/interface-effects';
import {
  ArrowRight,
  Building2,
  Check,
  ChevronRight,
  Crown,
  Film,
  FlaskConical,
  Globe2,
  LockKeyhole,
  MailPlus,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { type FormEvent, useState } from 'react';
import {
  type Invitation,
  type Member,
  addPreviewInvitation,
  createPreviewCompany,
  filterPreviewMembers,
  initialMembersPreview,
  moduleDescriptions,
  modules,
  previewOffers,
  savePreviewAccess,
} from './members-preview-model';
import styles from './members-preview.module.css';

const fieldClass =
  'mt-2 min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary';
const accessName = (m: Member) =>
  m.global
    ? 'Administrador global'
    : m.access === 'studio'
      ? 'Somente Vídeo Studio'
      : (m.role ?? 'Colaborador');
function Avatar({ name, large = false }: { name: string; large?: boolean }) {
  return (
    <span aria-hidden className={`${styles.avatar} ${large ? styles.largeAvatar : ''}`}>
      {name
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0])
        .join('')}
    </span>
  );
}
function Pill({
  children,
  tone = 'neutral',
}: { children: React.ReactNode; tone?: 'neutral' | 'cyan' | 'gold' }) {
  return (
    <span
      className={`${styles.pill} ${tone === 'gold' ? styles.gold : tone === 'cyan' ? styles.cyan : ''}`}
    >
      {children}
    </span>
  );
}

export function MembersPreview() {
  const { user, loading } = useAuth();
  if (loading) return <output>Verificando acesso…</output>;
  if (user?.role !== 'admin') return <p role="alert">Prévia restrita à administração.</p>;
  return <MembersPreviewContent />;
}

function MembersPreviewContent() {
  const { visual } = useInterfaceEffects();
  const [state, setState] = useState(initialMembersPreview);
  const [tab, setTab] = useState('people');
  const [group, setGroup] = useState('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteCompanyId, setInviteCompanyId] = useState<string | null>(null);
  const [onboardingId, setOnboardingId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [resetOpen, setResetOpen] = useState(false);
  const selected = state.members.find((m) => m.id === selectedId);
  const onboarding = state.members.find((m) => m.id === onboardingId);
  const people = filterPreviewMembers(state, query, group);
  const pending = state.members.filter((m) => m.pendingCompany);
  const companyName = (m: Member) =>
    state.companies.find((c) => c.id === m.companyId)?.name ??
    (m.pendingCompany ? 'Empresa ainda não criada' : 'Espaço pessoal');

  return (
    <section
      className={styles.root}
      data-effects={visual ? 'on' : 'off'}
      aria-label="Prévia de gestão de membros"
    >
      <div className={styles.previewBar}>
        <span>
          <FlaskConical size={16} aria-hidden /> Prévia local · sem alterações reais · recarregar
          restaura a demonstração
        </span>
        <button type="button" onClick={() => setResetOpen(true)}>
          Reiniciar demonstração
        </button>
      </div>
      <header className={styles.header}>
        <div>
          <div className={styles.context}>
            <ShieldCheck size={16} aria-hidden /> Administração da plataforma
          </div>
          <h1>Pessoas e empresas</h1>
          <p>Cada pessoa no lugar certo. Cada empresa com o seu próprio espaço.</p>
        </div>
        <Button
          onClick={() => {
            setInviteCompanyId(null);
            setInviteOpen(true);
          }}
        >
          <MailPlus aria-hidden /> Convidar pessoa
        </Button>
      </header>
      <div className={styles.summary} aria-label="Resumo demonstrativo">
        <div>
          <strong>{state.members.length}</strong>
          <span>Pessoas cadastradas</span>
        </div>
        <div>
          <strong>{state.companies.length}</strong>
          <span>Empresas vinculadas</span>
        </div>
        <div>
          <strong>{state.members.filter((m) => m.access === 'studio').length}</strong>
          <span>Somente Vídeo Studio</span>
        </div>
        <div>
          <strong className={pending.length ? styles.warningNumber : ''}>{pending.length}</strong>
          <span>Aguardando criar empresa</span>
        </div>
      </div>
      <output className={styles.notice}>
        {notice ? (
          <span key={notice} className={styles.confirmation}>
            <Check size={15} aria-hidden /> {notice}
          </span>
        ) : (
          'Classificação proposta a partir dos nomes informados. Permissões operacionais abaixo são uma simulação.'
        )}
      </output>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className={styles.tabs} aria-label="Gestão de membros">
          <TabsTrigger value="people">
            <Users size={16} aria-hidden /> Pessoas
          </TabsTrigger>
          <TabsTrigger value="companies">
            <Building2 size={16} aria-hidden /> Empresas
          </TabsTrigger>
          <TabsTrigger value="invitations">
            <MailPlus size={16} aria-hidden /> Convites{' '}
            <span className={styles.count}>{state.invitations.length}</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="people" data-motion-screen="members:people">
          <div className={styles.panel} data-motion-panel>
            <div className={styles.toolbar}>
              <label className={styles.search}>
                <Search size={17} aria-hidden />
                <span className="sr-only">Buscar pessoa, empresa ou função</span>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar pessoa, empresa ou função"
                />
              </label>
              <label className={styles.filter}>
                <span className="sr-only">Filtrar grupo de pessoas</span>
                <select value={group} onChange={(e) => setGroup(e.target.value)}>
                  <option value="all">Todas as pessoas</option>
                  <option value="global">Administradores globais</option>
                  <option value="tmx">Equipe TMX</option>
                  <option value="companies">Empresas independentes</option>
                  <option value="studio">Somente Vídeo Studio</option>
                </select>
              </label>
              <span className={styles.resultCount}>
                {people.length} {people.length === 1 ? 'pessoa' : 'pessoas'}
              </span>
            </div>
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <caption className="sr-only">Classificação proposta das pessoas no TMX</caption>
                <thead>
                  <tr>
                    <th>Pessoa</th>
                    <th>Empresa / espaço</th>
                    <th>Papel e acesso</th>
                    <th>Função</th>
                    <th>
                      <span className="sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {people.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <div className={styles.person}>
                          <Avatar name={m.name} />
                          <div>
                            <strong>{m.name}</strong>
                            <small>
                              {m.id === 'iago'
                                ? 'Você · dono da plataforma'
                                : m.global
                                  ? 'Acesso a toda a plataforma'
                                  : m.pendingCompany
                                    ? 'Primeiro acesso pendente'
                                    : m.access === 'studio'
                                      ? 'Projetos pessoais e privados'
                                      : 'Vinculado à empresa'}
                            </small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={styles.companyCell}>
                          {m.access === 'studio' ? (
                            <Film size={15} aria-hidden />
                          ) : (
                            <Building2 size={15} aria-hidden />
                          )}
                          {companyName(m)}
                        </span>
                        {m.companyId === 'yola-company' && (
                          <small className={styles.subtle}>
                            Nome ilustrativo · empresa existente
                          </small>
                        )}
                      </td>
                      <td>
                        <Pill tone={m.global ? 'gold' : m.access === 'studio' ? 'neutral' : 'cyan'}>
                          {m.global && <Crown size={12} aria-hidden />}
                          {accessName(m)}
                        </Pill>
                        {m.global && <small className={styles.subtle}>{m.role} da TMX</small>}
                      </td>
                      <td>{m.job}</td>
                      <td>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Ver acesso de ${m.name}`}
                          onClick={() => setSelectedId(m.id)}
                        >
                          Ver acesso <ChevronRight aria-hidden />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!people.length && (
              <div className={styles.empty}>
                <Search aria-hidden />
                <h3>Nenhuma pessoa encontrada</h3>
                <p>Altere o nome ou o grupo selecionado.</p>
                <Button
                  variant="outline"
                  onClick={() => {
                    setQuery('');
                    setGroup('all');
                  }}
                >
                  Limpar filtros
                </Button>
              </div>
            )}
            <footer className={styles.tableFooter}>
              <LockKeyhole size={14} aria-hidden /> Acesso completo é restrito à empresa. Acesso
              global é uma permissão separada.
            </footer>
          </div>
        </TabsContent>
        <TabsContent value="companies" data-motion-screen="members:companies">
          <div className={styles.companyGrid}>
            {state.companies.map((c) => {
              const members = state.members.filter((m) => m.companyId === c.id);
              return (
                <article className={styles.companyCard} key={c.id} data-motion-panel>
                  <div className={styles.companyHeading}>
                    <span className={styles.companyIcon}>
                      <Building2 aria-hidden />
                    </span>
                    <Pill tone="cyan">
                      {c.id === 'tmx' || c.illustrative
                        ? 'Empresa existente'
                        : 'Criada na simulação'}
                    </Pill>
                  </div>
                  <h2>{c.name}</h2>
                  <p>
                    {c.illustrative
                      ? 'O nome definitivo será confirmado no cadastro real.'
                      : c.id === 'tmx'
                        ? 'Sua operação, seu time e seus dados.'
                        : 'Ambiente independente, sem acesso às outras empresas.'}
                  </p>
                  <ul className={styles.companyPeople}>
                    {members.map((m) => (
                      <li key={m.id}>
                        <Avatar name={m.name} />
                        <div>
                          <strong>{m.name}</strong>
                          <small>
                            {m.role}
                            {m.global ? ' · também administrador global' : ''}
                          </small>
                        </div>
                        <button
                          type="button"
                          aria-label={`Ver acesso de ${m.name}`}
                          onClick={() => setSelectedId(m.id)}
                        >
                          <ChevronRight size={18} aria-hidden />
                        </button>
                      </li>
                    ))}
                  </ul>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setInviteCompanyId(c.id);
                      setInviteOpen(true);
                    }}
                  >
                    <MailPlus aria-hidden /> Convidar para {c.name}
                  </Button>
                </article>
              );
            })}
          </div>
          {pending.length > 0 && (
            <div className={`${styles.panel} ${styles.pending}`} data-motion-panel>
              <h2>Próximo passo: criar a empresa</h2>
              <p>Quem recebe acesso completo só começa a operar depois de concluir esta etapa.</p>
              {pending.map((m) => (
                <div className={styles.pendingRow} key={m.id}>
                  <div className={styles.person}>
                    <Avatar name={m.name} />
                    <div>
                      <strong>{m.name}</strong>
                      <small>Será dono apenas da própria empresa</small>
                    </div>
                  </div>
                  <Button variant="outline" onClick={() => setOnboardingId(m.id)}>
                    Simular primeiro acesso <ArrowRight aria-hidden />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
        <TabsContent value="invitations" data-motion-screen="members:invitations">
          <div className={styles.panel} data-motion-panel>
            <div className={styles.sectionHeading}>
              <div>
                <h2>Convites com destino definido</h2>
                <p>A pessoa já entra sabendo onde pode trabalhar.</p>
              </div>
              <Pill>Não envia e-mails</Pill>
            </div>
            {state.invitations.length ? (
              <ul className={styles.invites}>
                {state.invitations.map((i) => (
                  <li key={i.id}>
                    <span className={styles.companyIcon}>
                      <MailPlus aria-hidden />
                    </span>
                    <div>
                      <strong>{i.name}</strong>
                      <small>{i.email}</small>
                      <p>
                        {i.path === 'company'
                          ? 'Acesso completo · criar a própria empresa'
                          : i.path === 'studio'
                            ? 'Somente Vídeo Studio · espaço pessoal'
                            : `${state.companies.find((c) => c.id === i.companyId)?.name} · ${i.role}`}
                      </p>
                    </div>
                    <Pill tone="gold">Simulado · não enviado</Pill>
                  </li>
                ))}
              </ul>
            ) : (
              <div className={styles.empty}>
                <MailPlus aria-hidden />
                <h3>Nenhum convite simulado</h3>
                <p>
                  Teste o convite para uma nova empresa, para sua equipe ou apenas para o Studio.
                </p>
                <Button
                  onClick={() => {
                    setInviteCompanyId(null);
                    setInviteOpen(true);
                  }}
                >
                  Simular primeiro convite
                </Button>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
      <div className={styles.scopeNote}>
        <ShieldCheck size={18} aria-hidden />
        <p>
          <strong>Duas camadas, sem confusão.</strong> O papel define o que a pessoa faz dentro da
          empresa. Os módulos definem quais ferramentas ela pode usar. Somente Iago e Lucas têm
          acesso global nesta proposta.
        </p>
      </div>

      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      >
        <DialogContent
          className={`${styles.drawer} tmx-sidebar-dialog left-auto right-0 top-0 h-dvh max-h-none w-full max-w-none rounded-none sm:w-[500px] sm:max-h-none`}
          overlayClassName="bg-background/40 backdrop-blur-[2px]"
        >
          {selected && (
            <AccessDetails
              key={selected.id}
              member={selected}
              company={companyName(selected)}
              onOnboarding={() => {
                setOnboardingId(selected.id);
                setSelectedId(null);
              }}
              onSave={(patch) => {
                setState(savePreviewAccess(state, selected.id, patch));
                setSelectedId(null);
                setNotice(`Acessos de ${selected.name} atualizados somente na demonstração.`);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent
          className="max-w-2xl"
          overlayClassName="bg-background/40 backdrop-blur-[2px]"
        >
          {inviteOpen && (
            <InviteForm
              companies={state.companies}
              initialCompanyId={inviteCompanyId}
              onSubmit={(input) => {
                setState(addPreviewInvitation(state, input));
                setInviteOpen(false);
                setTab('invitations');
                setNotice(
                  'Convite simulado. Nenhum e-mail foi enviado e nenhuma conta foi criada.',
                );
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!onboarding}
        onOpenChange={(open) => {
          if (!open) setOnboardingId(null);
        }}
      >
        <DialogContent overlayClassName="bg-background/40 backdrop-blur-[2px]">
          {onboarding && (
            <CompanyOnboarding
              member={onboarding}
              onSubmit={(name) => {
                setState(createPreviewCompany(state, onboarding.id, name));
                setOnboardingId(null);
                setTab('companies');
                setNotice(`Empresa de ${onboarding.name} criada apenas nesta prévia.`);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reiniciar esta demonstração?</DialogTitle>
            <DialogDescription>
              Somente os convites, empresas e ajustes simulados nesta página serão descartados.
              Nenhum dado real será alterado.
            </DialogDescription>
          </DialogHeader>
          <Button
            onClick={() => {
              setState(initialMembersPreview());
              setResetOpen(false);
              setNotice('Demonstração reiniciada.');
            }}
          >
            Reiniciar prévia
          </Button>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function AccessDetails({
  member: m,
  company,
  onSave,
  onOnboarding,
}: {
  member: Member;
  company: string;
  onSave: (patch: Pick<Member, 'role' | 'job' | 'modules' | 'offers' | 'offerIds'>) => void;
  onOnboarding: () => void;
}) {
  const [role, setRole] = useState(m.role);
  const [job, setJob] = useState(m.job);
  const [allowed, setAllowed] = useState(m.modules);
  const [offers, setOffers] = useState(m.offers);
  const [offerIds, setOfferIds] = useState(m.offerIds ?? []);
  const [offerSearch, setOfferSearch] = useState('');
  const [saveError, setSaveError] = useState('');
  const companyOffers = previewOffers.filter((o) => o.companyId === m.companyId);
  const visibleOffers = companyOffers.filter((o) =>
    o.name.toLowerCase().includes(offerSearch.toLowerCase().trim()),
  );
  const editable = !m.global && m.role !== 'Dono' && m.access !== 'studio' && !m.pendingCompany;
  const full =
    m.global || role === 'Dono' || role === 'Sócio' || role === 'Administrador da empresa';
  return (
    <>
      <DialogHeader>
        <div className={styles.detailIdentity}>
          <Avatar name={m.name} large />
          <div>
            <DialogTitle>{m.name}</DialogTitle>
            <DialogDescription className="mt-2">{company}</DialogDescription>
          </div>
        </div>
      </DialogHeader>
      <div className={styles.accessScope}>
        <Globe2 size={20} aria-hidden />
        <div>
          <strong>
            {m.global
              ? 'Administrador global'
              : m.access === 'studio'
                ? 'Acesso individual ao Studio'
                : 'Acesso restrito à empresa'}
          </strong>
          <p>
            {m.global
              ? 'Pode administrar a plataforma e todas as empresas. Também faz parte da TMX.'
              : m.access === 'studio'
                ? 'Somente seus projetos e arquivos. Não precisa criar uma empresa.'
                : m.pendingCompany
                  ? 'A operação fica bloqueada até criar a própria empresa.'
                  : 'Não pode acessar outras empresas nem promover alguém a administrador global.'}
          </p>
        </div>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSaveError('');
          try {
            onSave({ role, job, modules: allowed, offers, offerIds });
          } catch (error) {
            setSaveError(
              error instanceof Error
                ? error.message
                : 'Não foi possível salvar. Revise as permissões.',
            );
          }
        }}
      >
        <div className={styles.detailFields}>
          <label>
            Papel na empresa
            <select
              className={fieldClass}
              value={role ?? 'studio'}
              disabled={!editable}
              onChange={(e) => setRole(e.target.value as Member['role'])}
            >
              {!editable && <option value={role ?? 'studio'}>{role ?? 'Não se aplica'}</option>}
              {editable && (
                <>
                  <option>Colaborador</option>
                  <option>Administrador da empresa</option>
                </>
              )}
            </select>
          </label>
          <label>
            Função
            <input
              className={fieldClass}
              value={job}
              disabled={!editable}
              maxLength={80}
              onChange={(e) => setJob(e.target.value)}
            />
          </label>
        </div>
        <fieldset className={styles.moduleList}>
          <legend>O que pode usar</legend>
          <p className="text-sm text-muted-foreground">
            Ferramentas disponíveis · {full ? modules.length : allowed.length} de {modules.length}{' '}
            liberadas
          </p>
          {editable && !full && (
            <div className="flex gap-3 py-2">
              <Button type="button" variant="outline" onClick={() => setAllowed([...modules])}>
                Liberar todas
              </Button>
              <Button type="button" variant="ghost" onClick={() => setAllowed([])}>
                Desmarcar todas
              </Button>
            </div>
          )}
          {full && (
            <p className="text-sm text-muted-foreground">
              Este papel inclui todas as ferramentas. Para personalizar, use Colaborador.
            </p>
          )}
          {modules.map((module) => (
            <label
              key={module}
              className={styles.permissionOption}
              data-selected={full || allowed.includes(module)}
            >
              <span>
                <strong>{module}</strong>
                <small>{moduleDescriptions[module]}</small>
              </span>
              <input
                type="checkbox"
                checked={full || allowed.includes(module)}
                disabled={!editable || full}
                onChange={(e) =>
                  setAllowed((a) =>
                    e.target.checked ? [...a, module] : a.filter((v) => v !== module),
                  )
                }
              />
            </label>
          ))}
        </fieldset>
        {m.access !== 'studio' && (
          <div className={styles.offerField}>
            <label htmlFor="permission-offer-mode">Ofertas autorizadas</label>
            <select
              id="permission-offer-mode"
              className={fieldClass}
              value={full ? 'all' : offers}
              disabled={!editable || full}
              onChange={(e) => setOffers(e.target.value as Member['offers'])}
            >
              <option value="all">Todas as ofertas da empresa</option>
              <option value="selected">Somente as ofertas liberadas</option>
            </select>
            <small>Catálogo demonstrativo · nenhuma oferta ou permissão real será alterada.</small>
            {!full && offers === 'selected' && (
              <fieldset className={styles.offerPicker}>
                <legend>
                  Em quais ofertas · {offerIds.length}{' '}
                  {offerIds.length === 1 ? 'selecionada' : 'selecionadas'}
                </legend>
                <input
                  className={fieldClass}
                  aria-label="Buscar ofertas para liberar"
                  placeholder="Buscar oferta…"
                  value={offerSearch}
                  onChange={(e) => setOfferSearch(e.target.value)}
                />
                {visibleOffers.map((offer) => (
                  <label
                    className={styles.permissionOption}
                    data-selected={offerIds.includes(offer.id)}
                    key={offer.id}
                  >
                    <span>
                      <strong>{offer.name}</strong>
                      <small>{company} · demonstração</small>
                    </span>
                    <input
                      type="checkbox"
                      disabled={!editable}
                      checked={offerIds.includes(offer.id)}
                      onChange={(e) =>
                        setOfferIds((ids) =>
                          e.target.checked
                            ? [...ids, offer.id]
                            : ids.filter((id) => id !== offer.id),
                        )
                      }
                    />
                  </label>
                ))}
                {!visibleOffers.length && (
                  <p className="text-sm text-muted-foreground">
                    {companyOffers.length
                      ? 'Nenhuma oferta corresponde à busca.'
                      : 'Esta empresa ainda não tem ofertas nesta demonstração.'}
                  </p>
                )}
                {offerIds.length === 0 && (
                  <p className="text-sm text-warning">
                    Nenhuma oferta liberada. As ferramentas não concedem acesso a ofertas por conta
                    própria.
                  </p>
                )}
              </fieldset>
            )}
          </div>
        )}
        <div className={styles.privateNote}>
          <LockKeyhole size={16} aria-hidden />
          <p>
            {m.access === 'studio'
              ? 'Sem ofertas, financeiro, notificações de vendas ou tarefas de outras pessoas.'
              : 'Tarefas atribuídas e calls com participação. Permissões reais serão conferidas no servidor.'}
          </p>
        </div>
        {editable ? (
          <div className={styles.accessActions}>
            {saveError && (
              <p role="alert" className="mb-3 text-sm text-danger">
                {saveError}
              </p>
            )}
            <p className="mb-3 text-xs text-muted-foreground">
              {full
                ? 'Todas as ferramentas e ofertas da empresa'
                : `${allowed.length} ${allowed.length === 1 ? 'ferramenta' : 'ferramentas'} · ${offers === 'all' ? 'todas as ofertas da empresa' : `${offerIds.length} ${offerIds.length === 1 ? 'oferta liberada' : 'ofertas liberadas'}`}`}
              {' · somente nesta demonstração'}
            </p>
            <Button className="w-full" type="submit">
              Salvar na demonstração
            </Button>
          </div>
        ) : m.pendingCompany ? (
          <Button className="w-full" type="button" onClick={onOnboarding}>
            Simular criação da empresa <ArrowRight aria-hidden />
          </Button>
        ) : (
          <p className={styles.readOnly}>
            <Check size={15} aria-hidden /> Perfil definido conforme a classificação combinada.
          </p>
        )}
      </form>
    </>
  );
}

function InviteForm({
  companies,
  initialCompanyId,
  onSubmit,
}: {
  companies: { id: string; name: string }[];
  initialCompanyId: string | null;
  onSubmit: (i: Invitation) => void;
}) {
  const [path, setPath] = useState<Invitation['path']>(initialCompanyId ? 'team' : 'company');
  const [company, setCompany] = useState(initialCompanyId ?? 'tmx');
  const [role, setRole] = useState<Invitation['role']>('Colaborador');
  const [error, setError] = useState('');
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    try {
      onSubmit({
        id: crypto.randomUUID(),
        name: String(form.get('name')),
        email: String(form.get('email')),
        path,
        companyId: path === 'team' ? company : null,
        role,
      });
    } catch (err) {
      setError(
        err instanceof Error && !err.message.startsWith('[')
          ? err.message
          : 'Confira o nome, o e-mail e a empresa.',
      );
    }
  }
  return (
    <>
      <DialogHeader>
        <DialogTitle>Convidar pessoa</DialogTitle>
        <DialogDescription>
          Defina o destino do acesso. Nesta prévia, nenhum e-mail é enviado.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className={styles.inviteForm}>
        <fieldset className={styles.paths}>
          <legend>Como essa pessoa vai usar o TMX?</legend>
          {(
            [
              [
                'company',
                'Criar a própria empresa',
                'Acesso completo. Cadastro da empresa obrigatório.',
                Building2,
              ],
              [
                'team',
                'Participar de uma empresa',
                'Colaborador ou administrador de uma empresa existente.',
                Users,
              ],
              [
                'studio',
                'Usar somente Vídeo Studio',
                'Espaço pessoal. Sem cadastro de empresa.',
                Film,
              ],
            ] as const
          ).map(([value, title, desc, Icon]) => (
            <label key={value} className={path === value ? styles.selectedPath : ''}>
              <input
                type="radio"
                name="path"
                value={value}
                checked={path === value}
                onChange={() => setPath(value)}
              />
              <Icon size={20} aria-hidden />
              <span>
                <strong>{title}</strong>
                <small>{desc}</small>
              </span>
            </label>
          ))}
        </fieldset>
        <div className={styles.detailFields}>
          <label>
            Nome
            <input
              className={fieldClass}
              name="name"
              required
              minLength={2}
              maxLength={100}
              placeholder="Nome da pessoa"
            />
          </label>
          <label>
            E-mail
            <input
              className={fieldClass}
              name="email"
              type="email"
              required
              maxLength={254}
              placeholder="pessoa@exemplo.com"
            />
          </label>
        </div>
        {path === 'team' && (
          <div className={styles.detailFields}>
            <label>
              Empresa
              <select
                className={fieldClass}
                value={company}
                onChange={(e) => setCompany(e.target.value)}
              >
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Papel
              <select
                className={fieldClass}
                value={role}
                onChange={(e) => setRole(e.target.value as Invitation['role'])}
              >
                <option>Colaborador</option>
                <option>Administrador da empresa</option>
              </select>
            </label>
          </div>
        )}
        <div className={styles.privateNote}>
          <ShieldCheck size={16} aria-hidden />
          <p>
            {path === 'company'
              ? 'Depois de aceitar: criar empresa → começar a operar. Nunca recebe acesso global.'
              : path === 'team'
                ? 'Entra na empresa selecionada. Não precisa criar outra empresa e não recebe acesso global.'
                : 'Entra direto no Vídeo Studio. Não vê empresas, vendas ou financeiro.'}
          </p>
        </div>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full">
          <MailPlus aria-hidden /> Criar convite demonstrativo
        </Button>
      </form>
    </>
  );
}

function CompanyOnboarding({
  member,
  onSubmit,
}: { member: Member; onSubmit: (name: string) => void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  return (
    <>
      <DialogHeader>
        <DialogTitle>Seu primeiro passo no TMX</DialogTitle>
        <DialogDescription>
          Simulando o acesso de {member.name}. Antes de operar, crie sua empresa.
        </DialogDescription>
      </DialogHeader>
      <div className={styles.onboardingIcon}>
        <Building2 size={32} aria-hidden />
      </div>
      <form
        className={styles.inviteForm}
        onSubmit={(e) => {
          e.preventDefault();
          try {
            onSubmit(name);
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      >
        <label>
          Nome da empresa
          <input
            autoComplete="off"
            required
            minLength={2}
            maxLength={80}
            className={fieldClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Como sua empresa se chama?"
          />
        </label>
        <div className={styles.privateNote}>
          <LockKeyhole size={16} aria-hidden />
          <p>
            Você será dono deste espaço. Ofertas, equipe e dados ficam separados das outras
            empresas.
          </p>
        </div>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full">
          Criar empresa na demonstração <ArrowRight aria-hidden />
        </Button>
        <p className={styles.subtle}>
          Iago, Lucas, Douglas e Yola reutilizam os vínculos existentes. Esta etapa não aparece para
          eles.
        </p>
      </form>
    </>
  );
}
