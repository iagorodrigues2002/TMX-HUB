'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useUpdateForm } from '@/hooks/use-update-form';
import type { Form, FormMode, UpdateFormRequest } from '@page-cloner/shared';
import { useEffect, useId } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

interface FormEditorProps {
  jobId: string;
  form: Form;
}

interface FormValues {
  mode: FormMode;
  currentAction: string;
  redirectTo: string;
}

export function FormEditor({ jobId, form }: FormEditorProps) {
  const id = useId();
  const update = useUpdateForm(jobId);
  const { register, handleSubmit, watch, setValue, reset } = useForm<FormValues>({
    defaultValues: {
      mode: form.mode,
      currentAction: form.currentAction,
      redirectTo: form.redirectTo ?? '',
    },
  });

  // Selection changes remount the editor; synchronize saved values here.
  useEffect(() => {
    reset({
      mode: form.mode,
      currentAction: form.currentAction,
      redirectTo: form.redirectTo ?? '',
    });
  }, [form.mode, form.currentAction, form.redirectTo, reset]);

  const mode = watch('mode');

  const onSubmit = handleSubmit(async (values) => {
    const body: UpdateFormRequest = { mode: values.mode };
    if (values.mode === 'replace' || values.mode === 'capture_redirect') {
      body.currentAction = values.currentAction;
    }
    if (values.mode === 'capture_redirect') {
      body.redirectTo = values.redirectTo;
    }
    try {
      await update.mutateAsync({ formId: form.id, body });
      toast.success('Formulário atualizado');
    } catch (err) {
      toast.error((err as Error).message);
    }
  });

  return (
    <form
      onSubmit={(event) => void onSubmit(event)}
      className="flex h-full flex-col gap-5 overflow-y-auto p-5"
    >
      <header className="space-y-1">
        <p className="hud-label">Form Editor</p>
        <h3 className="text-[14px] font-semibold text-white">Formulário</h3>
        <p className="break-all font-mono text-[10px] text-white/45">{form.selector}</p>
      </header>

      <div className="space-y-2">
        <Label htmlFor={`${id}-original`}>URL de envio original</Label>
        <Input
          id={`${id}-original`}
          value={form.originalAction}
          readOnly
          disabled
          className="font-mono text-[12px]"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${id}-mode`}>Modo</Label>
        <Select value={mode} onValueChange={(v) => setValue('mode', v as FormMode)}>
          <SelectTrigger id={`${id}-mode`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="keep">Manter original</SelectItem>
            <SelectItem value="replace">Substituir URL de envio</SelectItem>
            <SelectItem value="capture_redirect">Capturar e redirecionar</SelectItem>
            <SelectItem value="disable">Desabilitar envio</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {(mode === 'replace' || mode === 'capture_redirect') && (
        <div className="space-y-2">
          <Label htmlFor={`${id}-current-action`}>Nova URL de envio</Label>
          <Input
            id={`${id}-current-action`}
            type="url"
            placeholder="HTTPS://MEUSITE.COM/LEADS"
            {...register('currentAction', { required: true })}
          />
        </div>
      )}

      {mode === 'capture_redirect' && (
        <div className="space-y-2">
          <Label htmlFor={`${id}-redirect-to`}>Redirecionar usuário para</Label>
          <Input
            id={`${id}-redirect-to`}
            type="url"
            placeholder="HTTPS://MEUSITE.COM/OBRIGADO"
            {...register('redirectTo', { required: true })}
          />
        </div>
      )}

      <Button type="submit" disabled={update.isPending} className="w-full">
        {update.isPending ? 'Salvando…' : 'Salvar alterações'}
      </Button>

      <section className="space-y-2">
        <p className="hud-label">Campos ({form.fields.length})</p>
        <ul className="space-y-1 rounded-md border border-white/[0.08] bg-white/[0.02] p-3 text-[12px]">
          {form.fields.length === 0 ? (
            <li className="text-white/45">Nenhum campo detectado.</li>
          ) : (
            form.fields.map((f) => (
              <li
                key={`${f.name}-${f.type}`}
                className="flex items-center justify-between gap-2 font-mono"
              >
                <span className="truncate text-white/80">{f.name || '(sem nome)'}</span>
                <span className="text-[10px] uppercase tracking-[0.12em] text-white/45">
                  {f.type}
                  {f.required && ' *'}
                  {f.hidden && ' (oculto)'}
                </span>
              </li>
            ))
          )}
        </ul>
      </section>
    </form>
  );
}
