'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Globe, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';

const FormSchema = z.object({
  url: z.string().url({ message: 'Digite uma URL http(s) válida.' }),
  inlineAssets: z.boolean().default(false),
  renderJs: z.boolean().default(true),
});

type FormValues = z.infer<typeof FormSchema>;

export function UrlInputForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      url: '',
      inlineAssets: false,
      renderJs: true,
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitting(true);
    try {
      const job = await apiClient.createClone({
        url: values.url,
        options: {
          renderMode: values.renderJs ? 'js' : 'static',
          inlineAssets: values.inlineAssets,
          escalation: 'auto',
        },
      });
      toast.success('Clone iniciado');
      router.push(`/cloner/jobs/${job.id}`);
    } catch (err) {
      toast.error((err as Error).message);
      setSubmitting(false);
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="url">URL da página</Label>
        <div className="relative">
          <Globe className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-300/70" />
          <Input
            id="url"
            type="url"
            placeholder="HTTPS://EXEMPLO.COM/PAGINA"
            autoComplete="off"
            spellCheck={false}
            className="h-12 pl-11 text-[14px]"
            {...register('url')}
          />
        </div>
        {errors.url && (
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-rose-300">
            {errors.url.message}
          </p>
        )}
      </div>

      <fieldset className="space-y-3 rounded-md border border-white/[0.08] bg-white/[0.02] p-4">
        <legend className="px-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">
          Opções
        </legend>
        <label className="flex cursor-pointer items-center gap-3 text-[13px] text-white/75">
          <Checkbox defaultChecked {...register('renderJs')} />
          <span>Executar JavaScript (mais lento, mas necessário para SPAs)</span>
        </label>
        <label className="flex cursor-pointer items-center gap-3 text-[13px] text-white/75">
          <Checkbox {...register('inlineAssets')} />
          <span>Embutir assets (imagens, CSS, fontes) como data-URIs</span>
        </label>
      </fieldset>

      <Button type="submit" disabled={submitting} size="lg" className="w-full gap-2">
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Iniciando…
          </>
        ) : (
          'Clonar página'
        )}
      </Button>
    </form>
  );
}
