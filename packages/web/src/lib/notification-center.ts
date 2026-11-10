type CenterNotification =
  | { kind: 'sale'; unread: boolean }
  | { kind: 'task'; unread: boolean; status: string };

export type ApprovedSaleClick = { operatorId: string; operatorName: string | null };

export function saleKindBadge(orderKind: string | null) {
  if (orderKind === 'upsell') return { label: 'Upsell', variant: 'warning' } as const;
  const stage = /^upsell_([2-9]|[1-9][0-9]+)$/.exec(orderKind ?? '')?.[1];
  return stage
    ? ({ label: `Upsell ${stage}`, variant: 'warning' } as const)
    : ({ label: 'Venda principal', variant: 'success' } as const);
}

export function saleClickDetail(click: ApprovedSaleClick | null) {
  return click
    ? { label: 'Último clique', value: click.operatorName?.trim() || 'Usuário não identificado' }
    : { label: 'Origem', value: 'Venda natural' };
}

export function isActiveNotification(notification: CenterNotification): boolean {
  return notification.kind === 'sale' ? notification.unread : notification.status !== 'Concluído';
}
