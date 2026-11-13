'use client';
import { Button } from '@/components/ui/button';
import { useEffect, useState } from 'react';
import styles from './traffic-preview.module.css';
import { Panel, StatusPill } from './traffic-ui';
import type { useTrafficInventory } from './use-traffic-inventory';
import { useCompanyTrafficSettings } from './use-company-traffic-settings';

interface StructureItem {
  id: string;
  name: string;
  kind: 'ct' | 'profile';
  ct: string;
  active: boolean;
  assets: string[];
}
export function TrafficStructure({ assets }: { assets: ReturnType<typeof useTrafficInventory> }) {
  const [saved, setSaved] = useState<{ user: string; items: StructureItem[] }>({
    user: '',
    items: [],
  });
  const [editing, setEditing] = useState<StructureItem | null>(null);
  const [error, setError] = useState('');
  const companySettings = useCompanyTrafficSettings<StructureItem[]>('structure', assets.shared);
  const items = assets.shared ? companySettings.data?.value ?? [] : saved.user === assets.userId ? saved.items : [];
  useEffect(() => {
    setEditing(null);
    let items: StructureItem[] = [];
    try {
      const raw = JSON.parse(
        localStorage.getItem(`tmx:traffic-structure:${assets.userId}`) ?? '[]',
      );
      if (
        Array.isArray(raw) &&
        raw.every(
          (x) =>
            typeof x.id === 'string' &&
            typeof x.name === 'string' &&
            ['ct', 'profile'].includes(x.kind) &&
            Array.isArray(x.assets),
        )
      )
        items = raw;
    } catch {}
    setSaved({ user: assets.userId, items });
  }, [assets.userId]);
  async function save() {
    if (!editing || !editing.name.trim()) {
      setError('Informe o nome.');
      return;
    }
    const next = [
      ...items.filter((x) => x.id !== editing.id),
      { ...editing, name: editing.name.trim() },
    ];
    try {
      if (assets.shared) await companySettings.save(next);
      else localStorage.setItem(`tmx:traffic-structure:${assets.userId}`, JSON.stringify(next));
    } catch {
      setError('Não foi possível salvar. Atualize e tente novamente; os dados anteriores foram preservados.');
      return;
    }
    setSaved({ user: assets.userId, items: next });
    setEditing(null);
    setError('');
  }
  return (
    <Panel title="CTs e perfis">
      <div className={styles.toolbar}>
        {(['ct', 'profile'] as const).map((kind) => (
          <Button
            key={kind}
            variant="outline"
            onClick={() => {
              setError('');
              setEditing({
                id: crypto.randomUUID(),
                name: '',
                kind,
                ct: '',
                active: true,
                assets: [],
              });
            }}
          >
            {kind === 'ct' ? 'Criar CT' : 'Criar perfil'}
          </Button>
        ))}
        <span className={styles.subtle}>
          {items.filter((x) => x.kind === 'ct').length} CTs ·{' '}
          {items.filter((x) => x.kind === 'profile').length} perfis
        </span>
      </div>
      {editing && (
        <form
          className={styles.metadataEditor}
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className={styles.formGrid}>
            <label className={styles.field}>
              Nome do {editing.kind === 'ct' ? 'CT' : 'perfil'}
              <input
                required
                maxLength={100}
                className={styles.control}
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
            </label>
            {editing.kind === 'profile' && (
              <label className={styles.field}>
                CT
                <select
                  className={styles.control}
                  value={editing.ct}
                  onChange={(e) => setEditing({ ...editing, ct: e.target.value })}
                >
                  <option value="">Sem CT</option>
                  {items
                    .filter((x) => x.kind === 'ct')
                    .map((ct) => (
                      <option key={ct.id} value={ct.id}>
                        {ct.name}
                      </option>
                    ))}
                </select>
              </label>
            )}
            <label className={styles.field}>
              Status
              <select
                className={styles.control}
                value={String(editing.active)}
                onChange={(e) => setEditing({ ...editing, active: e.target.value === 'true' })}
              >
                <option value="true">Ativo</option>
                <option value="false">Desabilitado</option>
              </select>
            </label>
          </div>
          <details open>
            <summary>Vincular BMs e contas importadas</summary>
            <div className={styles.formGrid}>
              {[
                ...assets.inventory.bms.filter((b) => b.relationship === 'managed'),
                ...assets.inventory.accounts,
              ].map((asset) => (
                <label className={styles.field} key={asset.id}>
                  <span>
                    <input
                      type="checkbox"
                      checked={editing.assets.includes(asset.id)}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          assets: e.target.checked
                            ? [...editing.assets, asset.id]
                            : editing.assets.filter((id) => id !== asset.id),
                        })
                      }
                    />{' '}
                    {asset.name}
                  </span>
                </label>
              ))}
            </div>
          </details>
          <div className={styles.actions}>
            <Button type="submit">Salvar</Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
          </div>
          {error && (
            <p role="alert" className={styles.warning}>
              {error}
            </p>
          )}
        </form>
      )}
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <caption className="sr-only">CTs e perfis locais</caption>
          <thead>
            <tr>
              {['Estrutura', 'CT', 'Ativos vinculados', 'Status', 'Ação'].map((x) => (
                <th key={x}>{x}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <strong>{item.name}</strong>
                  <small>{item.kind === 'ct' ? 'CT' : 'Perfil'}</small>
                </td>
                <td>{items.find((x) => x.id === item.ct)?.name ?? '—'}</td>
                <td>
                  {item.assets
                    .map(
                      (id) =>
                        [...assets.inventory.bms, ...assets.inventory.accounts].find(
                          (a) => a.id === id,
                        )?.name,
                    )
                    .filter(Boolean)
                    .join(', ') || '—'}
                </td>
                <td>
                  <StatusPill status={item.active ? 'Ativo' : 'Desabilitado'} />
                </td>
                <td>
                  <Button variant="ghost" onClick={() => setEditing({ ...item })}>
                    Editar
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!items.length && (
        <p className={styles.empty}>Crie um CT ou perfil e vincule os ativos importados.</p>
      )}
      <small className={styles.subtle}>
        Organização local deste usuário. Perfis são cadastros internos.
      </small>
    </Panel>
  );
}
