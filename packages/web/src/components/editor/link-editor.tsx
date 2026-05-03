'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { Link } from '@page-cloner/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useUpdateLink } from '@/hooks/use-update-link';

interface LinkEditorProps {
  jobId: string;
  link: Link;
}

interface LinkValues {
  currentHref: string;
}

export function LinkEditor({ jobId, link }: LinkEditorProps) {
  const update = useUpdateLink(jobId);
  const { register, handleSubmit, reset } = useForm<LinkValues>({
    defaultValues: { currentHref: link.currentHref },
  });

  useEffect(() => {
    reset({ currentHref: link.currentHref });
  }, [link.id, link.currentHref, reset]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      await update.mutateAsync({
        linkId: link.id,
        body: { currentHref: values.currentHref },
      });
      toast.success('Link atualizado');
    } catch (err) {
      toast.error((err as Error).message);
    }
  });

  return (
    <form onSubmit={onSubmit} className="flex h-full flex-col gap-5 overflow-y-auto p-5">
      <header className="space-y-1">
        <p className="hud-label">Link Editor</p>
        <h3 className="text-[14px] font-semibold text-white">Link</h3>
        <p className="break-words text-[12px] text-white/55">
          {link.text || '(sem texto visível)'}
        </p>
      </header>

      <div className="flex flex-wrap gap-1.5 text-[10px] uppercase tracking-[0.18em]">
        {link.isCta && (
          <span className="rounded-sm border border-cyan-300/30 bg-cyan-300/10 px-1.5 py-0.5 text-cyan-100">
            CTA
          </span>
        )}
        {link.isExternal && (
          <span className="rounded-sm border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-white/60">
            externo
          </span>
        )}
        {link.rel && (
          <span className="rounded-sm border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-white/60">
            rel: {link.rel}
          </span>
        )}
      </div>

      <div className="space-y-2">
        <Label>URL original</Label>
        <Input value={link.originalHref} readOnly disabled className="font-mono text-[12px]" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="currentHref">Nova URL</Label>
        <Input
          id="currentHref"
          type="url"
          placeholder="HTTPS://SEU-DESTINO.COM/PAGINA"
          {...register('currentHref', { required: true })}
        />
      </div>

      <Button type="submit" disabled={update.isPending} className="w-full">
        {update.isPending ? 'Salvando…' : 'Salvar alterações'}
      </Button>
    </form>
  );
}
