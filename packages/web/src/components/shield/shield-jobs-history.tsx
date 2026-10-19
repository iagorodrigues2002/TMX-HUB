'use client';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { type ShieldJobView, apiClient } from '@/lib/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Package, RefreshCw } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { JobRow } from './shield-jobs-history-job-row';
import { FilterButton, MAX_BULK, MAX_BULK_BYTES } from './shield-jobs-history-support';

export function ShieldJobsHistory() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'ready' | 'working' | 'failed'>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);

  const { data, isLoading, refetch, isFetching } = useQuery<ShieldJobView[]>({
    queryKey: ['shield-jobs-list'],
    queryFn: () => apiClient.listShieldJobs(),
    refetchInterval: (q) => {
      const jobs = q.state.data ?? [];
      const anyWorking = jobs.some(
        (j) => j.status === 'queued' || j.status === 'processing' || j.status === 'verifying',
      );
      return anyWorking ? 5000 : false;
    },
    refetchOnWindowFocus: false,
  });

  const jobs = data ?? [];

  const filtered = useMemo(() => {
    if (filter === 'all') return jobs;
    if (filter === 'ready') return jobs.filter((j) => j.status === 'ready');
    if (filter === 'failed') return jobs.filter((j) => j.status === 'failed');
    return jobs.filter(
      (j) => j.status === 'queued' || j.status === 'processing' || j.status === 'verifying',
    );
  }, [jobs, filter]);

  // IDs selecionados que existem na lista filtrada (limpa stale após refetch).
  const visibleSelected = useMemo(
    () => filtered.filter((j) => selected.has(j.id) && j.status === 'ready'),
    [filtered, selected],
  );

  const readyInFiltered = useMemo(() => filtered.filter((j) => j.status === 'ready'), [filtered]);

  const totalBytesSelected = useMemo(
    () => visibleSelected.reduce((acc, j) => acc + (j.output?.bytes ?? 0), 0),
    [visibleSelected],
  );

  const allReadyChecked =
    readyInFiltered.length > 0 && readyInFiltered.every((j) => selected.has(j.id));

  const toggleOne = (id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllReady = () => {
    setSelected((s) => {
      const next = new Set(s);
      if (allReadyChecked) {
        for (const j of readyInFiltered) next.delete(j.id);
      } else {
        for (const j of readyInFiltered) next.add(j.id);
      }
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  const exceedsBytesCap = totalBytesSelected > MAX_BULK_BYTES;

  const onBulkDownload = async () => {
    if (visibleSelected.length === 0) return;
    if (visibleSelected.length > MAX_BULK) {
      toast.error(`Limite de ${MAX_BULK} arquivos por download. Selecione menos.`);
      return;
    }
    if (exceedsBytesCap) {
      toast.error(
        `Seleção tem ${(totalBytesSelected / 1024 / 1024 / 1024).toFixed(2)}GB. Máximo: 3GB por .zip.`,
      );
      return;
    }
    setDownloading(true);
    try {
      const ids = visibleSelected.map((j) => j.id);
      const r = await apiClient.bulkDownloadShieldJobs(ids);
      toast.success(`${ids.length} arquivos baixados (${(r.bytes / 1024 / 1024).toFixed(1)} MB).`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setDownloading(false);
    }
  };

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiClient.deleteShieldJob(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['shield-jobs-list'] });
      toast.success('Job removido.');
    },
    onError: (err) => toast.error((err as Error).message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <div>
          <p className="hud-label">Histórico</p>
          <h2 className="mt-1 text-[16px] font-semibold text-white">
            {jobs.length} job(s) recente(s)
          </h2>
          {jobs.some((j) => j.status === 'ready') && (
            <p className="mt-1 flex items-center gap-1.5 text-[11px] text-cyan-300/75">
              <Package className="h-3 w-3" />
              Marque os checkboxes abaixo pra baixar vários em um .zip (até 3GB).
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <FilterButton value="all" current={filter} onClick={setFilter} count={jobs.length} />
          <FilterButton
            value="working"
            current={filter}
            onClick={setFilter}
            count={
              jobs.filter(
                (j) =>
                  j.status === 'queued' || j.status === 'processing' || j.status === 'verifying',
              ).length
            }
            label="Em curso"
          />
          <FilterButton
            value="ready"
            current={filter}
            onClick={setFilter}
            count={jobs.filter((j) => j.status === 'ready').length}
            label="Prontos"
          />
          <FilterButton
            value="failed"
            current={filter}
            onClick={setFilter}
            count={jobs.filter((j) => j.status === 'failed').length}
            label="Falhas"
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void refetch()}
            disabled={isFetching}
            title="Recarregar"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Bulk action bar — aparece só quando há seleção válida */}
      {visibleSelected.length > 0 && (
        <div
          className={`glass-card flex items-center justify-between gap-3 p-3 ${
            exceedsBytesCap ? 'border-amber-300/40' : 'border-cyan-300/30'
          }`}
        >
          <div className="text-[13px] text-white/85">
            <span
              className={`font-semibold ${exceedsBytesCap ? 'text-amber-200' : 'text-cyan-200'}`}
            >
              {visibleSelected.length}
            </span>{' '}
            selecionado(s) ·{' '}
            <span
              className={`font-mono text-[11px] ${
                exceedsBytesCap ? 'text-amber-300' : 'text-white/55'
              }`}
            >
              {(totalBytesSelected / 1024 / 1024).toFixed(1)} MB
            </span>
            {exceedsBytesCap && (
              <span className="ml-2 text-[11px] text-amber-300/85">
                · excede 3GB, desmarque alguns
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={clearSelection} disabled={downloading}>
              Limpar
            </Button>
            <Button
              size="sm"
              onClick={() => void onBulkDownload()}
              disabled={downloading || exceedsBytesCap}
            >
              {downloading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Package className="h-3.5 w-3.5" />
              )}
              {downloading ? 'Empacotando…' : `Baixar .zip (${visibleSelected.length})`}
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="glass-card flex items-center justify-center p-8">
          <Loader2 className="h-5 w-5 animate-spin text-cyan-300" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-card p-8 text-center text-[13px] text-white/45">
          {jobs.length === 0
            ? 'Nenhum job ainda. Suba um vídeo no formulário acima.'
            : 'Nenhum job nesse filtro.'}
        </div>
      ) : (
        <div className="glass-card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-[12px]">
              <thead className="bg-white/[0.03] text-left text-[10px] font-semibold uppercase tracking-[0.16em] text-white/55">
                <tr>
                  <th className="w-8 px-3 py-2">
                    <Checkbox
                      checked={allReadyChecked}
                      onChange={toggleAllReady}
                      disabled={readyInFiltered.length === 0}
                      title={
                        readyInFiltered.length === 0
                          ? 'Sem prontos pra selecionar'
                          : allReadyChecked
                            ? 'Desmarcar todos'
                            : 'Marcar todos prontos'
                      }
                    />
                  </th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Arquivo</th>
                  <th className="px-3 py-2">Nicho · White</th>
                  <th className="px-3 py-2">Compressão</th>
                  <th className="px-3 py-2 text-right">Tamanho</th>
                  <th className="px-3 py-2">Quando</th>
                  <th className="px-3 py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((j) => (
                  <JobRow
                    key={j.id}
                    job={j}
                    selected={selected.has(j.id)}
                    onToggle={() => toggleOne(j.id)}
                    onDelete={() => {
                      if (confirm(`Remover job "${j.input.filename}"?`)) deleteMut.mutate(j.id);
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
