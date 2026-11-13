'use client';
import { Button } from '@/components/ui/button';
import { Search, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import {
  type Asset,
  type AssetKind,
  assetStatuses,
  assetUsages,
  saveAssetMetadata,
} from './traffic-model';
import styles from './traffic-preview.module.css';
import { TrafficStructure } from './traffic-structure';
import { Panel, StatusPill } from './traffic-ui';
import type { useTrafficInventory } from './use-traffic-inventory';

export function ContingencyPreview({
  assets,
  onSettings,
}: { assets: ReturnType<typeof useTrafficInventory>; onSettings: () => void }) {
  const [kind, setKind] = useState<AssetKind>('accounts');
  const [search, setSearch] = useState('');
  const [bm, setBm] = useState('');
  const [usage, setUsage] = useState('');
  const [status, setStatus] = useState('');
  const [editing, setEditing] = useState<Asset | null>(null);
  const [notice, setNotice] = useState('');
  const [showShared, setShowShared] = useState(false);
  const db = assets.inventory;
  const rows = db[kind].filter(
    (asset) =>
      (kind !== 'bms' ||
        (showShared ? asset.relationship !== 'managed' : asset.relationship === 'managed')) &&
      (!bm || asset.bm === bm || asset.id === bm) &&
      (!usage || asset.usage === usage) &&
      (!status || asset.status === status) &&
      `${asset.name} ${asset.external} ${asset.owner} ${asset.supplier}`
        .toLocaleLowerCase('pt-BR')
        .includes(search.trim().toLocaleLowerCase('pt-BR')),
  );
  async function save() {
    if (!editing) return;
    try {
      const next = saveAssetMetadata(db, kind, editing.id, editing);
      await assets.setInventory(next);
      setNotice(assets.shared ? 'Dados salvos para a empresa.' : 'Dados internos salvos nesta sessão local.');
      setEditing(null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Não foi possível salvar.');
    }
  }
  return (
    <div className={styles.pageStack}>
      <div className={styles.pageIntro}>
        <div>
          <p className={styles.eyebrow}>Estrutura da operação</p>
          <h2>Contingência</h2>
          <p>BMs e contas vinculadas ao System User. Identidade e vínculo vêm da Meta.</p>
        </div>
        <Button variant="outline" onClick={onSettings}>
          Configurar integração
        </Button>
      </div>
      <div className={styles.inventorySummary}>
        <ShieldCheck size={20} aria-hidden />
        <strong>
          {db.bms.filter((b) => b.relationship === 'managed').length} BM de operação /{' '}
          {db.accounts.length} contas
        </strong>
        <span>
          {assets.origin === 'meta' ? 'Inventário real importado' : 'Aguardando inventário real'}
        </span>
        <small>
          {assets.fetchedAt
            ? `Consulta em ${new Date(assets.fetchedAt).toLocaleString('pt-BR')}`
            : 'Aguardando conexão'}
        </small>
      </div>
      <TrafficStructure assets={assets} />
      <Panel
        title="Inventário de ativos"
        subtitle="Responsável, fornecedor, status e uso são internos do TMX; salvar não altera a Meta."
      >
        <div className={styles.toolbar}>
          {kind === 'bms' && (
            <Button variant="outline" onClick={() => setShowShared(!showShared)}>
              {showShared ? 'Ver BMs da operação' : 'Ver proprietários externos'}
            </Button>
          )}
          <div className={styles.segmented}>
            {(
              [
                ['accounts', 'Contas de anúncios'],
                ['bms', 'Business Managers'],
              ] as const
            ).map(([key, label]) => (
              <Button
                key={key}
                variant={kind === key ? 'secondary' : 'ghost'}
                aria-pressed={kind === key}
                onClick={() => {
                  setKind(key);
                  setEditing(null);
                }}
              >
                {label}
              </Button>
            ))}
          </div>
          <span className={styles.subtle}>
            {rows.length} de {db[kind].length} ativos
          </span>
        </div>
        <div className={styles.toolbar}>
          <label className={styles.search}>
            <Search size={15} aria-hidden />
            <input
              aria-label="Buscar ativo"
              placeholder="Nome, ID, responsável ou fornecedor"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <select
            className={styles.control}
            aria-label="Filtrar BM"
            value={bm}
            onChange={(event) => setBm(event.target.value)}
          >
            <option value="">Todas as BMs</option>
            {db.bms.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <select
            className={styles.control}
            aria-label="Filtrar status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">Todos os status</option>
            {assetStatuses.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
          <select
            className={styles.control}
            aria-label="Filtrar uso"
            value={usage}
            onChange={(event) => setUsage(event.target.value)}
          >
            <option value="">Todos os usos</option>
            {assetUsages.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </div>
        {editing && (
          <form
            className={styles.metadataEditor}
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            <div className={styles.sectionHeading}>
              <div>
                <h3>Editar dados internos</h3>
                <p>
                  {editing.name} · {editing.external}
                </p>
              </div>
            </div>
            <div className={styles.formGrid}>
              <label className={styles.field}>
                Responsável
                <input
                  maxLength={100}
                  className={styles.control}
                  value={editing.owner}
                  onChange={(event) => setEditing({ ...editing, owner: event.target.value })}
                />
              </label>
              <label className={styles.field}>
                Fornecedor
                <input
                  maxLength={100}
                  className={styles.control}
                  value={editing.supplier}
                  onChange={(event) => setEditing({ ...editing, supplier: event.target.value })}
                />
              </label>
              <label className={styles.field}>
                Status interno
                <select
                  className={styles.control}
                  value={editing.status ?? ''}
                  onChange={(event) =>
                    setEditing({
                      ...editing,
                      status: event.target.value ? (event.target.value as Asset['status']) : null,
                    })
                  }
                >
                  <option value="">Não informado</option>
                  {assetStatuses.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                Uso
                <select
                  className={styles.control}
                  value={editing.usage}
                  onChange={(event) =>
                    setEditing({ ...editing, usage: event.target.value as Asset['usage'] })
                  }
                >
                  {assetUsages.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className={styles.actions}>
              <Button type="submit">Salvar dados internos</Button>
              <Button variant="ghost" type="button" onClick={() => setEditing(null)}>
                Cancelar
              </Button>
            </div>
          </form>
        )}
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <caption className="sr-only">
              Inventário de {kind === 'accounts' ? 'contas de anúncios' : 'BMs'}
            </caption>
            <thead>
              <tr>
                {[
                  'Ativo / ID Meta',
                  'Acesso',
                  kind === 'accounts' ? 'BM vinculada' : 'Contas',
                  'Responsável',
                  'Fornecedor',
                  'Status interno',
                  'Uso',
                  'Ações',
                ].map((label) => (
                  <th key={label} scope="col">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((asset) => (
                <tr key={asset.id}>
                  <td>
                    <strong>{asset.name}</strong>
                    <small>{asset.external}</small>
                  </td>
                  <td>
                    {kind === 'bms'
                      ? asset.relationship === 'managed'
                        ? 'BM da operação'
                        : asset.relationship === 'shared'
                          ? 'Proprietário externo'
                          : 'Acesso não confirmado'
                      : db.bms.find((b) => b.id === asset.bm)?.relationship === 'managed'
                        ? 'Conta própria'
                        : 'Compartilhada / não confirmado'}
                  </td>
                  <td>
                    {kind === 'accounts' ? (
                      (db.bms.find((item) => item.id === asset.bm)?.name ?? 'Sem BM informada')
                    ) : (
                      <button
                        className={styles.textButton}
                        type="button"
                        onClick={() => {
                          setBm(asset.id);
                          setKind('accounts');
                        }}
                      >
                        {db.accounts.filter((item) => item.bm === asset.id).length} contas →
                      </button>
                    )}
                  </td>
                  <td>{asset.owner || 'A definir'}</td>
                  <td>{asset.supplier || 'A definir'}</td>
                  <td>
                    <StatusPill status={asset.status ?? 'Não informado'} />
                    {asset.metaStatus !== asset.status && (
                      <small>Meta: {asset.metaStatus ?? 'Não informado'}</small>
                    )}
                  </td>
                  <td>
                    <span className={styles.usage} data-usage={asset.usage}>
                      {asset.usage}
                    </span>
                  </td>
                  <td>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Editar ${asset.name} · ${asset.external}`}
                      onClick={() => {
                        setEditing({ ...asset });
                        setNotice('');
                      }}
                    >
                      Editar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <p className={styles.empty}>Nenhum ativo corresponde aos filtros.</p>}
        </div>
        <output aria-live="polite" className={styles.subtle}>
          {notice || assets.error}
        </output>
      </Panel>
    </div>
  );
}
