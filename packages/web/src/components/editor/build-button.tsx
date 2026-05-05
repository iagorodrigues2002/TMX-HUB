'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, Hammer } from 'lucide-react';
import { toast } from 'sonner';
import type { BundleFormat } from '@page-cloner/shared';
import { useBuildJob, useCreateBuild } from '@/hooks/use-build-job';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface BuildButtonProps {
  jobId: string;
  disabled?: boolean;
}

export function BuildButton({ jobId, disabled }: BuildButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<BundleFormat>('zip');
  const [inlineAssets, setInlineAssets] = useState(true);
  const [activeBuildId, setActiveBuildId] = useState<string | undefined>();

  const create = useCreateBuild(jobId);
  const build = useBuildJob(jobId, activeBuildId);

  const onSubmit = async () => {
    try {
      const job = await create.mutateAsync({
        format,
        inlineAssets,
        applyEdits: true,
      });
      setActiveBuildId(job.id);
      toast.message('Geração na fila', {
        description: `Gerando pacote ${format.toUpperCase()}…`,
      });
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const reset = () => {
    setActiveBuildId(undefined);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button disabled={disabled} className="gap-2">
          <Hammer className="h-4 w-4" />
          Gerar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Gerar pacote</DialogTitle>
          <DialogDescription>
            Captura as alterações atuais e gera um arquivo para download.
          </DialogDescription>
        </DialogHeader>

        {!activeBuildId && (
          <div className="space-y-5 pt-2">
            <div className="space-y-2">
              <Label htmlFor="format">Formato</Label>
              <Select value={format} onValueChange={(v) => setFormat(v as BundleFormat)}>
                <SelectTrigger id="format">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="html">Arquivo HTML único</SelectItem>
                  <SelectItem value="zip">ZIP (HTML + assets)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3">
              <Checkbox
                id="inline"
                checked={inlineAssets}
                onChange={(e) => setInlineAssets(e.target.checked)}
              />
              <Label htmlFor="inline" className="cursor-pointer normal-case tracking-normal text-[13px] text-white/80">
                Incluir assets (imagens, fontes, CSS)
              </Label>
            </div>
          </div>
        )}

        {activeBuildId && (
          <BuildProgress
            jobId={jobId}
            buildId={activeBuildId}
            status={build.data?.status}
            downloadUrl={build.data?.downloadUrl}
            errorMessage={build.data?.error?.message}
            onView={() => {
              setOpen(false);
              router.push(`/tools/cloner/jobs/${jobId}/preview`);
            }}
          />
        )}

        <DialogFooter>
          {!activeBuildId ? (
            <Button onClick={onSubmit} disabled={create.isPending}>
              {create.isPending ? 'Iniciando…' : 'Iniciar geração'}
            </Button>
          ) : (
            <Button variant="outline" onClick={reset}>
              Gerar novamente
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface BuildProgressProps {
  jobId: string;
  buildId: string;
  status: string | undefined;
  downloadUrl?: string;
  errorMessage?: string;
  onView: () => void;
}

function BuildProgress({ status, downloadUrl, errorMessage, onView }: BuildProgressProps) {
  if (status === 'failed') {
    return (
      <div className="rounded-md border border-rose-400/40 bg-rose-500/10 p-4 text-[13px]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-200">
          Geração falhou
        </p>
        {errorMessage && <p className="mt-2 text-white/65">{errorMessage}</p>}
      </div>
    );
  }
  if (status === 'ready') {
    return (
      <div className="space-y-3 rounded-md border border-cyan-300/30 bg-cyan-300/[0.06] p-4 text-[13px]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-200">
          Pacote pronto
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild disabled={!downloadUrl}>
            <a
              href={downloadUrl ?? '#'}
              className="gap-2"
              download
              target="_blank"
              rel="noreferrer"
            >
              <Download className="h-4 w-4" />
              {downloadUrl ? 'Baixar' : 'Carregando…'}
            </a>
          </Button>
          <Button variant="outline" onClick={onView}>
            Abrir preview final
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-md border border-white/[0.08] bg-white/[0.02] p-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
      {status === 'building' ? 'Gerando…' : 'Na fila…'}
    </div>
  );
}
