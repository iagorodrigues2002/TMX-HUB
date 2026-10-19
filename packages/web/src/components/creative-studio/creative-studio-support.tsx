'use client';

import { Checkbox } from '@/components/ui/checkbox';
import type { Gauge, ShieldCheck } from 'lucide-react';

export const compressionOptions = [
  { value: 'none', label: 'Qualidade máxima', description: 'Mantém o máximo de detalhes' },
  { value: 'balanced', label: 'Equilibrada', description: 'Boa qualidade com tamanho reduzido' },
  { value: 'small', label: 'Arquivo menor', description: 'Prioriza velocidade e economia' },
] as const;

export const aspectRatioOptions = [
  { value: 'original', label: 'Original', description: 'Preserva o formato do vídeo' },
  { value: '9:16', label: '9:16 · Stories/Reels', description: 'Vertical para telas de celular' },
  { value: '4:5', label: '4:5 · Feed', description: 'Vertical para publicações no feed' },
  { value: '1:1', label: '1:1 · Quadrado', description: 'Formato quadrado universal' },
] as const;

export const extensionOptions = [
  { value: 'none', label: 'Não estender', description: 'Mantém a duração original' },
  { value: 'loop', label: 'Repetir em loop', description: 'Repete até a duração escolhida' },
  { value: 'freeze', label: 'Congelar frame final', description: 'Segura a última imagem' },
] as const;

export const MAX_BATCH_FILES = 30;

export const MAX_FILE_BYTES = 500 * 1024 * 1024;

// Uploads grandes passam pela API e seguem em streaming para o storage.
// Serializar evita saturar a conexão/instância e perder o lote inteiro.
export const UPLOAD_CONCURRENCY = 1;

export const MAX_BULK_BYTES = 3 * 1024 * 1024 * 1024;

export type UploadItem = {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'done' | 'failed';
  progress: number;
  error?: string;
};

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <span className="hud-label block">{label}</span>
      {children}
    </div>
  );
}

export function OptionField({
  icon: Icon,
  label,
  description,
  children,
}: { icon: typeof Gauge; label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="group rounded-xl border border-white/[0.08] bg-white/[0.025] p-3.5 transition-all hover:border-cyan-300/20 hover:bg-cyan-300/[0.025] focus-within:border-cyan-300/30 focus-within:ring-2 focus-within:ring-cyan-300/[0.08]">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-lg border border-cyan-300/10 bg-cyan-300/[0.06] text-cyan-300">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <span className="hud-label block">{label}</span>
          <p className="truncate text-[11px] text-white/40">{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

export function ToggleCard({
  icon: Icon,
  title,
  description,
  checked,
  onChange,
}: {
  icon: typeof ShieldCheck;
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = `toggle-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3.5 transition-all hover:border-cyan-300/20 hover:bg-cyan-300/[0.035]"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/[0.04] text-white/55">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-white/85">{title}</span>
        <span className="block text-xs text-white/40">{description}</span>
      </span>
      <Checkbox id={id} checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}
