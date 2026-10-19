'use client';
import { Button } from '@/components/ui/button';
import { copyText } from '@/lib/clipboard';
import { Copy } from 'lucide-react';
import type { useEntryLinkActions } from './use-entry-link-actions';
import type { useFormState } from './use-form-state';
export function renderEntryLinkActions({
  link,
  canManage,
  setConvertingEntryLinkId,
  setEditingEntryLinkId,
  setEditingEntryLinkName,
  setEditingEntryDestination,
  setEditingEntryTrafficSource,
  setEntryAbName,
  setEntryAbDestinationA,
  setEntryAbDestinationB,
  removeEntryLink,
}: {
  link: {
    id: string;
    name: string;
    slug: string;
    destination_url: string;
    traffic_source:
      | 'meta'
      | 'google'
      | 'tiktok'
      | 'native'
      | 'organic'
      | 'email'
      | 'other'
      | 'unknown';
    ab_test_id?: string;
    tracking_url: string;
    enabled: boolean;
    created_at: string;
    updated_at: string;
  };
  canManage: boolean;
  setConvertingEntryLinkId: ReturnType<typeof useFormState>['setConvertingEntryLinkId'];
  setEditingEntryLinkId: ReturnType<typeof useFormState>['setEditingEntryLinkId'];
  setEditingEntryLinkName: ReturnType<typeof useFormState>['setEditingEntryLinkName'];
  setEditingEntryDestination: ReturnType<typeof useFormState>['setEditingEntryDestination'];
  setEditingEntryTrafficSource: ReturnType<typeof useFormState>['setEditingEntryTrafficSource'];
  setEntryAbName: ReturnType<typeof useFormState>['setEntryAbName'];
  setEntryAbDestinationA: ReturnType<typeof useFormState>['setEntryAbDestinationA'];
  setEntryAbDestinationB: ReturnType<typeof useFormState>['setEntryAbDestinationB'];
  removeEntryLink: ReturnType<typeof useEntryLinkActions>['removeEntryLink'];
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <Button
        size="sm"
        onClick={() => void copyText(link.tracking_url, 'Link de entrada copiado.')}
      >
        <Copy className="mr-2 h-3.5 w-3.5" />
        Copiar para o anúncio
      </Button>
      {link.ab_test_id ? (
        <>
          <Button asChild size="sm" variant="outline">
            <a
              href={`${link.tracking_url}?tmx_preview=1&tmx_variant=A`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Testar variante A
            </a>
          </Button>
          <Button asChild size="sm" variant="outline">
            <a
              href={`${link.tracking_url}?tmx_preview=1&tmx_variant=B`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Testar variante B
            </a>
          </Button>
        </>
      ) : (
        <Button asChild size="sm" variant="outline">
          <a href={`${link.tracking_url}?tmx_preview=1`} target="_blank" rel="noopener noreferrer">
            Testar sem contabilizar
          </a>
        </Button>
      )}
      {canManage && !link.ab_test_id && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setConvertingEntryLinkId('');
            setEditingEntryLinkId(link.id);
            setEditingEntryLinkName(link.name);
            setEditingEntryDestination(link.destination_url);
            setEditingEntryTrafficSource(link.traffic_source);
          }}
        >
          Editar destino
        </Button>
      )}
      {canManage && !link.ab_test_id && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setEditingEntryLinkId('');
            setConvertingEntryLinkId(link.id);
            setEntryAbName(`${link.name} · A/B`);
            setEntryAbDestinationA(link.destination_url);
            setEntryAbDestinationB('');
          }}
        >
          Transformar em teste A/B
        </Button>
      )}
      {canManage && (
        <Button
          size="sm"
          variant="ghost"
          disabled={removeEntryLink.isPending}
          onClick={() => {
            if (window.confirm(`Remover o link "${link.name}"?`)) {
              removeEntryLink.mutate(link.id);
            }
          }}
        >
          Remover
        </Button>
      )}
    </div>
  );
}
