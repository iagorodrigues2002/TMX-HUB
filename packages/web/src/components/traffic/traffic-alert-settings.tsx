'use client';
import { Button } from '@/components/ui/button';
import { request } from '@/lib/api-client/request';
import { useAuth } from '@/lib/auth-context';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import styles from './traffic-preview.module.css';
import { Panel, StatusPill } from './traffic-ui';
export function TrafficAlertSettings() {
  const { user } = useAuth();
  const companies = useQuery({
    queryKey: ['traffic-alert-companies', user?.id],
    queryFn: () =>
      request<{ companies: { id: string; name: string; role: string }[] }>('/v1/companies'),
    enabled: !!user,
  });
  const settings = useQuery({
    queryKey: ['traffic-alert-settings', user?.id],
    queryFn: () =>
      request<{
        companyId: string | null;
        intervalMinutes: number;
        lastCheckedAt: string | null;
        accounts: number;
        incompleteAccounts: number;
      }>('/v1/meta-control/traffic/alerts'),
    enabled: !!user,
    refetchInterval: 15000,
  });
  const [companyId, setCompanyId] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    setCompanyId(settings.data?.companyId ?? '');
  }, [settings.data?.companyId]);
  async function save() {
    setBusy(true);
    setNotice('');
    try {
      await request('/v1/meta-control/traffic/alerts/company', {
        method: 'POST',
        body: { companyId: companyId || null },
      });
      await settings.refetch();
      setNotice('Destinatários atualizados.');
    } catch {
      setNotice('Não foi possível salvar a empresa dos alertas.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel title="Alertas do tráfego">
      <StatusPill
        status={
          settings.data?.lastCheckedAt &&
          Date.now() - Date.parse(settings.data.lastCheckedAt) < 20 * 60000
            ? settings.data.incompleteAccounts
              ? 'Monitoramento parcial'
              : 'Monitoramento ativo'
            : 'Aguardando leitura de referência'
        }
      />
      <p className={styles.subtle}>
        Reprovação de anúncio e conta desabilitada na central. Recebem os membros ativos com acesso
        a Tráfego nesta empresa.
      </p>
      <div className={styles.toolbar}>
        <label className={styles.field}>
          Empresa dos alertas
          <select
            className={styles.control}
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
          >
            <option value="">Somente o proprietário da conexão</option>
            {companies.data?.companies
              .filter((c) => ['owner', 'admin'].includes(c.role))
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </label>
        <Button disabled={settings.isPending || busy} onClick={() => void save()}>
          {busy ? 'Salvando…' : 'Salvar destinatários'}
        </Button>
      </div>
      <output aria-live="polite" className={styles.subtle}>
        {notice}
      </output>
      <small className={styles.subtle}>
        Verificação a cada 5 minutos. A primeira leitura cria a referência, sem disparar reprovações
        antigas.
      </small>
    </Panel>
  );
}
