'use client';
import { Button } from '@/components/ui/button';
import { request } from '@/lib/api-client/request';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { TrafficAlertSettings } from './traffic-alert-settings';
import styles from './traffic-preview.module.css';
import { Panel, StatusPill } from './traffic-ui';
import type { LiveTraffic } from './use-live-traffic';
import type { useTrafficInventory } from './use-traffic-inventory';

export function TrafficSettings({
  assets,
  live,
}: { assets: ReturnType<typeof useTrafficInventory>; live: LiveTraffic }) {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [token, setToken] = useState('');
  const [businessId, setBusinessId] = useState('');
  const [busy, setBusy] = useState(false);
  const [frontOnly, setFrontOnly] = useState(false);
  const [notice, setNotice] = useState('');
  const connected = live.personal || live.status.data?.connected;
  async function connect() {
    if (busy) return;
    setBusy(true);
    setNotice('');
    try {
      await request('/v1/meta-control/traffic/connection', {
        method: 'POST',
        body: { name, token, frontOnly, ...(businessId ? { businessId } : {}) },
      });
      setToken('');
      setOpen(false);
      setNotice('System User conectado para a empresa.');
      await Promise.all(
        [
          'traffic-user-connection',
          'traffic-real-campaigns',
          'traffic-local-inventory',
          'traffic-real-finance',
        ].map((key) => client.invalidateQueries({ queryKey: [key] })),
      );
    } catch {
      setNotice('Não foi possível conectar. Confira o token, as permissões e a BM informada.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={styles.pageStack}>
      <div className={styles.pageIntro}>
        <div>
          <p className={styles.eyebrow}>Integrações</p>
          <h2>Configurações de tráfego</h2>
        </div>
      </div>
      <Panel title="System User">
        <div className={styles.toolbar}>
          <StatusPill status={connected ? 'Conectado' : 'Desconectado'} />
          {live.connection.data?.name && <strong>{live.connection.data.name}</strong>}
          <Button
            onClick={() => {
              setOpen(!open);
              setToken('');
              setNotice('');
            }}
          >
            Configurar System User
          </Button>
          {!live.personal && (
            <Button
              variant="outline"
              disabled={!connected || live.status.data?.busy || live.refresh.isPending}
              onClick={() => live.refresh.mutate()}
            >
              Atualizar Meta
            </Button>
          )}
        </div>
        {open && (
          <form
            className={styles.metadataEditor}
            onSubmit={(e) => {
              e.preventDefault();
              void connect();
            }}
          >
            <div className={styles.formGrid}>
              <label className={styles.field}>
                Nome da conexão
                <input
                  required
                  maxLength={100}
                  className={styles.control}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Empresa / operação"
                />
              </label>
              <label className={styles.field}>
                Token do System User
                <input
                  required
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  minLength={20}
                  maxLength={4096}
                  className={styles.control}
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                />
              </label>
              <label className={styles.field}>
                ID da BM da operação (opcional)
                <input
                  inputMode="numeric"
                  pattern="[0-9]+"
                  className={styles.control}
                  value={businessId}
                  onChange={(e) => setBusinessId(e.target.value)}
                  placeholder="ID da sua BM"
                />
              </label>
            </div>
            <label className={styles.field}>
              <span>
                <input
                  type="checkbox"
                  checked={frontOnly}
                  onChange={(e) => setFrontOnly(e.target.checked)}
                />{' '}
                Envio somente vendas de front no Purchase da Meta
              </span>
            </label>
            <small className={styles.subtle}>
              Token criptografado na API, exclusivo deste usuário. A BM informada identifica sua
              operação.
            </small>
            <div className={styles.actions}>
              <Button type="submit" disabled={busy}>
                {busy ? 'Validando…' : 'Validar e conectar'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setOpen(false);
                  setToken('');
                }}
              >
                Cancelar
              </Button>
            </div>
          </form>
        )}
        <output aria-live="polite" className={styles.subtle}>
          {notice || live.connection.data?.error || live.status.data?.error}
        </output>
        <div className={styles.financialFlow}>
          <div>
            <span>Contas acessíveis</span>
            <strong>{live.data.data?.accounts.length ?? '—'}</strong>
          </div>
          <div>
            <span>BMs da operação</span>
            <strong>
              {assets.inventory.bms.filter((b) => b.relationship === 'managed').length}
            </strong>
          </div>
          <div>
            <span>Campanhas no período</span>
            <strong>{live.data.data?.campaigns.length ?? '—'}</strong>
          </div>
        </div>
      </Panel>
      <TrafficAlertSettings />
      <div className={styles.settingsGrid}>
        <Panel title="Sincronização">
          <StatusPill
            status={
              live.personal || live.service.data?.running
                ? 'Atualização automática ativa'
                : 'Serviço indisponível'
            }
          />
          <p className={styles.subtle}>
            Sincronização no servidor: hoje a cada 10 min; ontem a cada hora. Continua com o Mac
            desligado.
          </p>
        </Panel>
        <Panel title="Moeda e retorno">
          <dl className={styles.metricDefinitions}>
            <div>
              <dt>ROAS Meta</dt>
              <dd>Valor Purchase ÷ investimento.</dd>
            </div>
            <div>
              <dt>ROAS TMX Geral</dt>
              <dd>Resultado final da Visão geral ÷ investimento.</dd>
            </div>
          </dl>
          <details>
            <summary>Critérios</summary>
            <p className={styles.subtle}>
              TMX usa o resultado após taxas e reserva. Câmbio diário em BRL ou USD por{' '}
              {live.data.data?.fx?.provider ?? 'Frankfurter / ECB'}. Resultados não são rateados por
              anúncio.
            </p>
          </details>
        </Panel>
      </div>
    </div>
  );
}
