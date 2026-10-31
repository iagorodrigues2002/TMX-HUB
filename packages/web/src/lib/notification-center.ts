type CenterNotification =
  | { kind: 'sale'; unread: boolean }
  | { kind: 'task'; unread: boolean; status: string };

export type ApprovedSaleClick = { operatorId: string; operatorName: string | null };

export function saleClickDetail(click: ApprovedSaleClick | null) {
  return click
    ? { label: 'Último clique', value: click.operatorName?.trim() || 'Usuário não identificado' }
    : { label: 'Origem', value: 'Venda natural' };
}

export function isActiveNotification(notification: CenterNotification): boolean {
  return notification.kind === 'sale'
    ? notification.unread
    : notification.status !== 'Concluído';
}
