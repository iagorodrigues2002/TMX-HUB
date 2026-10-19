'use client';

import { Button } from '@/components/ui/button';
import type { InviteView } from '@/lib/api-client';
import { Copy, Trash2 } from 'lucide-react';
import { copyText, daysLeft, formatDate, inviteUrl } from './invites-section-support';

export function InviteRow({
  invite,
  onRevoke,
}: {
  invite: InviteView;
  onRevoke: () => void;
}) {
  const url = inviteUrl(invite.token);
  const remaining = daysLeft(invite.expiresAt);
  const expiringSoon = remaining <= 1;

  return (
    <li className="rounded-md border border-white/[0.06] bg-black/15 p-3">
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-white">
              {invite.email || invite.name || 'Convite sem destinatário'}
            </p>
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${
                expiringSoon
                  ? 'border-amber-300/40 bg-amber-300/10 text-amber-200'
                  : 'border-white/[0.10] bg-white/[0.04] text-white/55'
              }`}
            >
              expira em {remaining}d
            </span>
            {invite.allowedTools && invite.allowedTools.length > 0 && (
              <span className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-200">
                {invite.allowedTools.length === 1
                  ? invite.allowedTools[0]
                  : `${invite.allowedTools.length} tools`}
              </span>
            )}
          </div>
          {invite.name && invite.email && (
            <p className="text-[11px] text-white/55">{invite.name}</p>
          )}
          <p className="break-all font-mono text-[11px] text-white/65" title={url}>
            {url}
          </p>
          <p className="text-[10px] text-white/40">
            criado em {formatDate(invite.createdAt)}
            {invite.invitedBy && <> · por {invite.invitedBy}</>}
          </p>
        </div>
        <div className="flex w-full shrink-0 flex-row gap-1 sm:w-auto sm:flex-col">
          <Button size="sm" variant="outline" onClick={() => copyText(url, 'Link')}>
            <Copy className="h-3 w-3" />
            Copiar
          </Button>
          <Button size="sm" variant="ghost" onClick={onRevoke}>
            <Trash2 className="h-3 w-3" />
            Revogar
          </Button>
        </div>
      </div>
    </li>
  );
}
