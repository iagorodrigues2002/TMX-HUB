export const referenceSections = [
  { id: 'foundations', label: 'Fundamentos' },
  { id: 'components', label: 'Componentes' },
  { id: 'data', label: 'Dados e estados' },
  { id: 'motion', label: 'Movimento' },
  { id: 'login', label: 'Login' },
  { id: 'operations', label: 'Operação' },
  { id: 'notifications', label: 'Notificações' },
  { id: 'coverage', label: 'Auditoria' },
] as const;

/** Revisão estática por família; “parcial” não significa tela migrada ou validada. */
export const productCoverage = [
  {
    area: 'Shell e navegação',
    status: 'Parcial',
    priority: 'P1',
    missing: 'Menu real completo, busca global, drawer mobile, hierarquia e foco ao trocar rotas.',
  },
  {
    area: 'Tabelas e listas operacionais',
    status: 'Parcial',
    priority: 'P1',
    missing:
      'Exemplo com busca, ordenação, seleção em lote, paginação e cabeçalho fixo. Validar listas reais e grandes volumes.',
  },
  {
    area: 'Formulários e períodos',
    status: 'Parcial',
    priority: 'P1',
    missing:
      'DateRangeFilter, textarea, CSV opcional e alterações não salvas demonstrados. Faltam seleções com busca e dependências reais.',
  },
  {
    area: 'Financeiro e métricas',
    status: 'Parcial',
    priority: 'P1',
    missing:
      'Moedas, custos, reservas, conciliação, privacidade por contexto e confirmação de alterações.',
  },
  {
    area: 'Empresa, membros e permissões',
    status: 'Não demonstrado',
    priority: 'P1',
    missing: 'Empresa ativa, convite, papéis, ferramentas/ofertas autorizadas e acesso negado.',
  },
  {
    area: 'Tracking e integrações',
    status: 'Parcial',
    priority: 'P1',
    missing:
      'Abas aninhadas, credenciais mascaradas, logs, timelines e estados de conexão/webhook.',
  },
  {
    area: 'Tarefas e calls',
    status: 'Não demonstrado',
    priority: 'P2',
    missing: 'Responsável, prazo, status, filtros/paginação, agendamento e regras por empresa.',
  },
  {
    area: 'Ferramentas e jobs',
    status: 'Parcial',
    priority: 'P1',
    missing:
      'Fila, progresso, falha parcial, retry e cancelamento simulados. Faltam contratos reais, edição/preview e download.',
  },
  {
    area: 'Login e ciclo de acesso',
    status: 'Parcial',
    priority: 'P1',
    missing:
      'Login demonstrado; faltam convite/cadastro, sessão expirada, retorno à rota e recuperação real.',
  },
  {
    area: 'Erros, atualização e movimento',
    status: 'Parcial',
    priority: 'P1',
    missing:
      'Dados antigos, offline, acesso negado e erro demonstrados. Faltam confirmação real de escrita e teste de desempenho.',
  },
  {
    area: 'Ajuda e páginas públicas',
    status: 'Não demonstrado',
    priority: 'P2',
    missing: 'Textos longos, links, hierarquia editorial e páginas legais/auxiliares.',
  },
] as const;

export const referencePalette = [
  { token: '--ds-canvas', label: 'Fundo', color: '#06151d' },
  { token: '--ds-text', label: 'Texto', color: '#f5fbfc' },
  { token: '--ds-muted', label: 'Texto secundário', color: '#cfdee3' },
  { token: '--ds-action', label: 'Ação', color: '#b2dfe4' },
  { token: '--ds-positive', label: 'Melhora', color: '#9ac8b0' },
  { token: '--ds-negative', label: 'Piora', color: '#d3a6a4' },
] as const;

export const referenceMotion = [
  {
    name: 'Mapa',
    value: '3.800 ms',
    detail: 'Pulsos escalonados; pausa e seleção acessível por país.',
  },
  {
    name: 'Gráfico',
    value: '950 ms',
    detail: 'Curva, pontos e valores interpolados no mesmo quadro.',
  },
  {
    name: 'Funil',
    value: '6.000 ms',
    detail: 'Varredura, ícones e setas em sequência; pausa fora de vista.',
  },
  {
    name: 'Menus e select',
    value: '240 / 160 ms',
    detail: 'Entrada e saída, foco e Esc preservados.',
  },
  {
    name: 'Lateral e fundo',
    value: '520 ms',
    detail: 'Sobreposição; o conteúdo mantém sua largura.',
  },
  {
    name: 'Contagem numérica',
    value: '1.650 ms',
    detail: 'Zero na entrada; valor atual ao mudar filtros.',
  },
  { name: 'Comparativos', value: '1.450 ms', detail: 'Interpolação e mudança de cor discretas.' },
  {
    name: 'Troca de telas',
    value: '220 + até 80 ms',
    detail: 'Navegação imediata; entrada com transform e opacity, sem cópia ou desfoque.',
  },
] as const;

/** Importadores TSX diretos observados na auditoria inicial; não é uma contagem de instâncias. */
export const primitiveAudit = [
  {
    name: 'Button',
    file: 'button.tsx',
    consumers: 125,
    action: 'Reusar variantes e feedback; retirar halo no novo tema.',
  },
  {
    name: 'Input',
    file: 'input.tsx',
    consumers: 58,
    action: 'Reusar ref e estados; adaptar superfície e foco.',
  },
  {
    name: 'Label',
    file: 'label.tsx',
    consumers: 30,
    action: 'Reusar associação de rótulo e campo.',
  },
  {
    name: 'DataState',
    file: 'data-state.tsx',
    consumers: 24,
    action: 'Preservar erro, vazio, retry e detalhes técnicos.',
  },
  {
    name: 'Select',
    file: 'select.tsx',
    consumers: 12,
    action: 'Reusar Radix; garantir tema e movimento nos portais.',
  },
  {
    name: 'Checkbox',
    file: 'checkbox.tsx',
    consumers: 11,
    action: 'Preservar input nativo e toque; reduzir brilho.',
  },
  {
    name: 'Dialog',
    file: 'dialog.tsx',
    consumers: 11,
    action: 'Preservar foco, Esc e descrição; adaptar material.',
  },
  {
    name: 'Tabs',
    file: 'tabs.tsx',
    consumers: 6,
    action: 'Preservar teclado; revisar overflow e lente ativa.',
  },
  {
    name: 'DateRangeFilter',
    file: 'date-range-filter.tsx',
    consumers: 6,
    action: 'Manter contrato de datas; revisar largura e horários equivalentes.',
  },
  {
    name: 'FormField',
    file: 'form-field.tsx',
    consumers: 6,
    action: 'Reusar erro, ajuda, aria-describedby e sucesso.',
  },
  {
    name: 'Kpi',
    file: 'kpi.tsx',
    consumers: 5,
    action: 'Reusar valores acessíveis; alinhar contagem e comparativos.',
  },
  {
    name: 'DropdownMenu',
    file: 'dropdown-menu.tsx',
    consumers: 5,
    action: 'Reusar Radix e navegação; animar entrada e saída.',
  },
  {
    name: 'Badge',
    file: 'badge.tsx',
    consumers: 3,
    action: 'Manter status sem depender só de cor; reduzir tracking.',
  },
  {
    name: 'Card',
    file: 'card.tsx',
    consumers: 1,
    action: 'Reusar composição; migrar gradualmente os painéis manuais.',
  },
] as const;
