'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { copyText } from '@/lib/clipboard';
import { Copy, Eye, EyeOff, Pencil, Save, Trash2 } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import {
  CompensationFields,
  type CompensationReport,
  type CompensationSettings,
  CompensationSummary,
} from './finance-compensation';

export type Pix = { type: 'cpf' | 'cnpj' | 'email' | 'phone' | 'random'; value: string };
export type Payee = { user_id: string; name: string; status: string; pix: Pix | null };

export function PayeeRow({
  payee,
  month,
  report,
  save,
  removePix,
}: {
  payee: Payee;
  month: string;
  report: CompensationReport;
  save: (pix: Pix, settings: CompensationSettings) => Promise<void>;
  removePix: () => Promise<void>;
}) {
  const id = useId();
  const editButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  const [editing, setEditing] = useState(false);
  const [pix, setPix] = useState<Pix>(payee.pix ?? { type: 'email', value: '' });
  const [settings, setSettings] = useState(report.settings);
  const pixDirty =
    editing &&
    (pix.type !== (payee.pix?.type ?? 'email') || pix.value !== (payee.pix?.value ?? ''));
  const [busy, setBusy] = useState<'save' | 'remove' | null>(null);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!editing && returnFocus.current) {
      editButton.current?.focus({ preventScroll: true });
      returnFocus.current = false;
    }
  }, [editing]);
  function open() {
    setPix(payee.pix ?? { type: 'email', value: '' });
    setSettings(report.settings);
    setMessage(null);
    setVisible(false);
    setCopied(false);
    setEditing(true);
  }
  async function copy() {
    if (!payee.pix || pixDirty || busy) return;
    setCopied(false);
    setCopied(await copyText(payee.pix.value, 'Chave Pix copiada.'));
  }
  async function submit() {
    if (busy) return;
    setBusy('save');
    setMessage(null);
    try {
      await save({ ...pix, value: pix.value.trim() }, settings);
      setVisible(false);
      returnFocus.current = true;
      setEditing(false);
      setMessage({ kind: 'success', text: 'Pix e remuneração salvos. Resumo atualizado.' });
    } catch {
      setMessage({
        kind: 'error',
        text: 'Não foi possível salvar os dados. Confira os valores, o formato do Pix e sua permissão. Suas alterações foram mantidas.',
      });
    } finally {
      setBusy(null);
    }
  }
  async function remove() {
    if (busy) return;
    setBusy('remove');
    setMessage(null);
    try {
      await removePix();
      setPix({ type: 'email', value: '' });
      setVisible(false);
      setCopied(false);
      setMessage({ kind: 'success', text: 'Chave Pix removida. A remuneração foi preservada.' });
    } catch {
      setMessage({
        kind: 'error',
        text: 'Não foi possível remover a chave Pix. Suas alterações foram mantidas.',
      });
    } finally {
      setBusy(null);
    }
  }
  return (
    <article
      aria-label={`Dados de ${payee.name}`}
      className="glass-card space-y-4 rounded-lg border border-border bg-background/40 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="break-words font-medium">
            {payee.name}
            {payee.status === 'suspended' ? ' · suspenso' : ''}
          </h3>
          <span className="mt-1 inline-block text-xs text-muted-foreground">
            {payee.pix ? 'Pix cadastrado' : 'Sem Pix cadastrado'}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-11"
            aria-label={`Copiar chave Pix de ${payee.name}`}
            disabled={!!busy || !payee.pix || pixDirty}
            success={copied}
            successLabel="Copiado"
            onClick={() => {
              void copy();
            }}
          >
            <Copy aria-hidden="true" className="h-4 w-4" /> Copiar Pix
          </Button>
          <Button
            ref={editButton}
            type="button"
            variant="outline"
            className="h-11"
            aria-expanded={editing}
            aria-controls={`${id}-editor`}
            disabled={!!busy}
            onClick={() => {
              if (editing) {
                returnFocus.current = true;
                setEditing(false);
                setMessage(null);
                setVisible(false);
              } else open();
            }}
          >
            <Pencil aria-hidden="true" className="h-4 w-4" />
            {editing
              ? 'Fechar edição'
              : report.configured || payee.pix
                ? 'Editar dados'
                : 'Configurar dados'}
          </Button>
        </div>
      </div>
      {!editing ? (
        <CompensationSummary report={report} month={month} />
      ) : (
        <form
          id={`${id}-editor`}
          aria-label={`Pix e remuneração de ${payee.name}`}
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <fieldset disabled={!!busy} className="min-w-0 space-y-4">
            <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
              <label className="grid gap-1 text-sm">
                Tipo de Pix
                <select
                  className="h-11 rounded-md border border-input bg-background px-3 text-sm"
                  value={pix.type}
                  onChange={(e) => {
                    setPix({ ...pix, type: e.target.value as Pix['type'] });
                    setCopied(false);
                  }}
                >
                  <option value="email">E-mail</option>
                  <option value="cpf">CPF</option>
                  <option value="cnpj">CNPJ</option>
                  <option value="phone">Telefone</option>
                  <option value="random">Aleatória</option>
                </select>
              </label>
              <label htmlFor={`${id}-pix`} className="grid min-w-0 gap-1 text-sm">
                Chave Pix
                <Input
                  id={`${id}-pix`}
                  required
                  autoComplete="off"
                  maxLength={254}
                  type={visible ? 'text' : 'password'}
                  className="h-11"
                  value={pix.value}
                  onChange={(e) => {
                    setPix({ ...pix, value: e.target.value });
                    setCopied(false);
                  }}
                />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
              <Button
                type="button"
                variant="outline"
                className="h-11"
                disabled={!pix.value}
                aria-pressed={visible}
                onClick={() => setVisible(!visible)}
              >
                {visible ? (
                  <EyeOff aria-hidden="true" className="h-4 w-4" />
                ) : (
                  <Eye aria-hidden="true" className="h-4 w-4" />
                )}
                {visible ? 'Ocultar' : 'Mostrar'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-11 text-destructive"
                aria-label={`Remover chave Pix de ${payee.name}`}
                disabled={!payee.pix}
                loading={busy === 'remove'}
                loadingLabel="Removendo…"
                onClick={() => {
                  if (window.confirm('Remover a chave Pix deste colaborador?')) void remove();
                }}
              >
                <Trash2 aria-hidden="true" className="h-4 w-4" /> Remover Pix
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              CPF/CNPJ: apenas números. Telefone: código do país, como +5511999999999. Cadastro não
              valida titularidade nem realiza pagamentos.
            </p>
            <CompensationFields
              settings={settings}
              setSettings={setSettings}
              upsells={report.upsells}
            />
            <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
              <Button
                type="button"
                variant="outline"
                className="h-11"
                onClick={() => {
                  returnFocus.current = true;
                  setEditing(false);
                  setMessage(null);
                  setVisible(false);
                }}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="h-11"
                disabled={!pix.value.trim()}
                loading={busy === 'save'}
                loadingLabel="Salvando…"
              >
                <Save aria-hidden="true" className="h-4 w-4" /> Salvar dados do colaborador
              </Button>
            </div>
          </fieldset>
        </form>
      )}
      {message && (
        <p
          role={message.kind === 'error' ? 'alert' : 'status'}
          className={`text-sm ${message.kind === 'error' ? 'text-destructive' : 'text-success dark:text-success'}`}
        >
          {message.text}
        </p>
      )}
    </article>
  );
}
