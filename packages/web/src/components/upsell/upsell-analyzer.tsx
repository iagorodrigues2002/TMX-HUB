'use client';

import { Plus, Save, Trash2, Upload, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  type CalcOutput,
  type ColumnMap,
  type FrontConfig,
  type FunnelStepConfig,
  runCalculation,
} from '@/lib/upsell/calc';
import {
  CHECKOUT_PRESETS,
  type CheckoutPlatform,
  PLATFORM_OPTIONS,
  autoMapAllColumns,
} from '@/lib/upsell/checkout-presets';
import { type ParsedSheet, parseSpreadsheet } from '@/lib/upsell/parse-spreadsheet';
import {
  type SavedPreset,
  deletePreset,
  getPreset,
  listPresets,
  savePreset,
} from '@/lib/upsell/storage';
import { ResultsChart } from './results-chart';

const EMPTY_COLS: ColumnMap = {
  customerId: '',
  product: '',
  offer: '',
  status: '',
  dateTime: '',
};

export function UpsellAnalyzer() {
  const [platform, setPlatform] = useState<CheckoutPlatform>('hotmart');

  const [frontSheet, setFrontSheet] = useState<ParsedSheet | null>(null);
  const [upsellSheet, setUpsellSheet] = useState<ParsedSheet | null>(null);
  const [frontFileName, setFrontFileName] = useState('');
  const [upsellFileName, setUpsellFileName] = useState('');

  const [frontCols, setFrontCols] = useState<ColumnMap>(EMPTY_COLS);
  const [upsellCols, setUpsellCols] = useState<ColumnMap>(EMPTY_COLS);

  const [frontConfig, setFrontConfig] = useState<FrontConfig>({
    name: 'Front',
    product: '',
    offers: [],
    startTime: '',
  });
  const [steps, setSteps] = useState<FunnelStepConfig[]>([
    { name: 'Up01', product: '', offers: [] },
    { name: 'Up02', product: '', offers: [] },
    { name: 'Up03', product: '', offers: [] },
    { name: 'Up04', product: '', offers: [] },
  ]);

  const [results, setResults] = useState<CalcOutput | null>(null);

  const [savedList, setSavedList] = useState<SavedPreset[]>([]);
  const [presetName, setPresetName] = useState('');
  const [selectedPresetId, setSelectedPresetId] = useState('');
  useEffect(() => setSavedList(listPresets()), []);

  const preset = CHECKOUT_PRESETS[platform];

  // Auto-map columns when files load OR platform changes.
  useEffect(() => {
    if (!frontSheet) return;
    const auto = autoMapAllColumns(frontSheet.columns, preset);
    setFrontCols((prev) => ({
      customerId: prev.customerId || auto.customerId || '',
      product: prev.product || auto.product || '',
      offer: prev.offer || auto.offer || '',
      status: prev.status || auto.status || '',
      dateTime: prev.dateTime || auto.dateTime || '',
    }));
  }, [frontSheet, preset]);

  useEffect(() => {
    if (!upsellSheet) return;
    const auto = autoMapAllColumns(upsellSheet.columns, preset);
    setUpsellCols((prev) => ({
      customerId: prev.customerId || auto.customerId || '',
      product: prev.product || auto.product || '',
      offer: prev.offer || auto.offer || '',
      status: prev.status || auto.status || '',
      dateTime: prev.dateTime || auto.dateTime || '',
    }));
  }, [upsellSheet, preset]);

  const handleFile = async (kind: 'front' | 'upsell', file: File) => {
    try {
      const parsed = await parseSpreadsheet(file);
      if (kind === 'front') {
        setFrontSheet(parsed);
        setFrontFileName(file.name);
        setFrontCols(EMPTY_COLS); // re-trigger auto-map
      } else {
        setUpsellSheet(parsed);
        setUpsellFileName(file.name);
        setUpsellCols(EMPTY_COLS);
      }
      toast.success(`${file.name}: ${parsed.rows.length} linhas, ${parsed.columns.length} colunas`);
    } catch (err) {
      toast.error(`Erro lendo ${file.name}: ${(err as Error).message}`);
    }
  };

  const canCalculate =
    !!frontSheet &&
    !!upsellSheet &&
    frontCols.customerId &&
    frontCols.product &&
    frontCols.offer &&
    upsellCols.customerId &&
    upsellCols.product &&
    upsellCols.offer &&
    upsellCols.status;

  const handleCalculate = () => {
    if (!frontSheet || !upsellSheet) return;
    try {
      const out = runCalculation({
        preset,
        front: { sheet: frontSheet, columns: frontCols, config: frontConfig },
        upsell: { sheet: upsellSheet, columns: upsellCols },
        steps,
      });
      setResults(out);
      toast.success(`Calculado · ${out.eligibleCount} clientes elegíveis`);
    } catch (err) {
      toast.error(`Erro no cálculo: ${(err as Error).message}`);
    }
  };

  const handleSavePreset = () => {
    if (!presetName.trim()) {
      toast.error('Dê um nome para o preset.');
      return;
    }
    savePreset({
      name: presetName.trim(),
      platform,
      frontColumns: frontCols,
      upsellColumns: upsellCols,
      front: frontConfig,
      steps,
    });
    setSavedList(listPresets());
    setPresetName('');
    toast.success('Preset salvo.');
  };

  const handleLoadPreset = () => {
    if (!selectedPresetId) return;
    const p = getPreset(selectedPresetId);
    if (!p) return;
    setPlatform(p.platform);
    setFrontCols(p.frontColumns);
    setUpsellCols(p.upsellColumns);
    setFrontConfig(p.front);
    setSteps(p.steps);
    toast.success(`Preset "${p.name}" carregado.`);
  };

  const handleDeletePreset = () => {
    if (!selectedPresetId) return;
    deletePreset(selectedPresetId);
    setSavedList(listPresets());
    setSelectedPresetId('');
    toast.success('Preset removido.');
  };

  const addStep = () =>
    setSteps((prev) => [
      ...prev,
      { name: `Up${String(prev.length + 1).padStart(2, '0')}`, product: '', offers: [] },
    ]);
  const removeStep = (i: number) =>
    setSteps((prev) => prev.filter((_, idx) => idx !== i));
  const updateStep = (i: number, patch: Partial<FunnelStepConfig>) =>
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));

  return (
    <div className="space-y-6">
      {/* Section 1: Platform + Files */}
      <section className="glass-card space-y-4 p-6">
        <header>
          <p className="hud-label">1 · Plataforma de checkout</p>
          <h2 className="mt-1 text-[16px] font-semibold text-white">
            Selecione e suba os relatórios
          </h2>
        </header>

        <div className="space-y-2">
          <Label className="hud-label">Plataforma</Label>
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value as CheckoutPlatform)}
            className="flex h-11 w-full rounded-md border border-white/[0.10] bg-white/[0.04] px-4 text-[14px] text-white focus-visible:outline-none focus-visible:border-cyan-300/40"
          >
            {PLATFORM_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <p className="text-[12px] text-white/40">
            Define os hints de auto-mapeamento das colunas e quais valores de status
            contam como "aprovado" para cada plataforma.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <FilePicker
            label="Planilha Front (xlsx, xls, csv)"
            fileName={frontFileName}
            sheet={frontSheet}
            onFile={(f) => handleFile('front', f)}
          />
          <FilePicker
            label="Planilha Upsell (única, com todos)"
            fileName={upsellFileName}
            sheet={upsellSheet}
            onFile={(f) => handleFile('upsell', f)}
          />
        </div>
      </section>

      {/* Section 2: Column mapping */}
      {(frontSheet || upsellSheet) && (
        <section className="glass-card space-y-4 p-6">
          <header>
            <p className="hud-label">2 · Mapeamento de colunas</p>
            <h2 className="mt-1 text-[16px] font-semibold text-white">
              Ajuste se a auto-detecção errou
            </h2>
          </header>
          <div className="grid gap-6 md:grid-cols-2">
            <ColumnMapper
              title="Front"
              sheet={frontSheet}
              cols={frontCols}
              onChange={setFrontCols}
              showStatus={false}
              showDateTime
            />
            <ColumnMapper
              title="Upsell"
              sheet={upsellSheet}
              cols={upsellCols}
              onChange={setUpsellCols}
              showStatus
              showDateTime={false}
            />
          </div>
        </section>
      )}

      {/* Section 3: Funnel config */}
      <section className="glass-card space-y-4 p-6">
        <header>
          <p className="hud-label">3 · Configuração do funil</p>
          <h2 className="mt-1 text-[16px] font-semibold text-white">
            Defina produto + ofertas de cada etapa
          </h2>
        </header>

        <div className="space-y-2">
          <Label className="hud-label">Front · considerar vendas a partir de (HH:MM, opcional)</Label>
          <Input
            type="text"
            value={frontConfig.startTime ?? ''}
            placeholder="ex: 14:00"
            onChange={(e) => setFrontConfig({ ...frontConfig, startTime: e.target.value })}
            className="max-w-[200px]"
          />
          {frontConfig.startTime && !frontCols.dateTime && (
            <p className="text-[12px] text-amber-300">
              ⚠ Para usar filtro de horário, mapeie a coluna "Data/Hora" do Front acima.
            </p>
          )}
        </div>

        <FunnelRow
          step={frontConfig}
          onChange={(patch) => setFrontConfig({ ...frontConfig, ...patch })}
          tone="front"
        />

        {steps.map((step, i) => (
          <FunnelRow
            key={i}
            step={step}
            onChange={(patch) => updateStep(i, patch)}
            onRemove={steps.length > 1 ? () => removeStep(i) : undefined}
          />
        ))}

        <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] pt-3">
          <Button type="button" variant="ghost" size="sm" onClick={addStep}>
            <Plus className="h-3.5 w-3.5" />
            Adicionar upsell
          </Button>
          <Button type="button" onClick={handleCalculate} disabled={!canCalculate}>
            Calcular
          </Button>
        </div>
      </section>

      {/* Section 4: Results */}
      {results && (
        <section className="glass-card space-y-5 p-6">
          <header className="flex items-baseline justify-between">
            <div>
              <p className="hud-label">4 · Resultado</p>
              <h2 className="mt-1 text-[16px] font-semibold text-white">
                {results.eligibleCount.toLocaleString('pt-BR')} clientes elegíveis no Front
              </h2>
            </div>
            <span className="hud-label">As 3 taxas sempre somam 100%</span>
          </header>

          <ResultsChart results={results.steps} />

          <div className="overflow-x-auto rounded-md border border-white/[0.06]">
            <table className="w-full text-[12px]">
              <thead className="bg-white/[0.03] text-left text-[10px] font-semibold uppercase tracking-[0.16em] text-white/55">
                <tr>
                  <th className="px-3 py-2">Etapa</th>
                  <th className="px-3 py-2">Produto · Ofertas</th>
                  <th className="px-3 py-2 text-right">Aceite</th>
                  <th className="px-3 py-2 text-right">Rejeite</th>
                  <th className="px-3 py-2 text-right">Não viu</th>
                </tr>
              </thead>
              <tbody>
                {results.steps.map((s) => (
                  <tr key={s.name} className="border-t border-white/[0.04] text-white/75">
                    <td className="px-3 py-2 font-semibold uppercase tracking-[0.12em] text-white/90">
                      {s.name}
                    </td>
                    <td className="px-3 py-2 text-white/55">
                      {s.product || '*qualquer produto*'}
                      {s.offers.length > 0 && ` · ${s.offers.join(', ')}`}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-emerald-300">
                      {s.accepted} <span className="text-white/40">({s.rates.accepted}%)</span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-amber-300">
                      {s.rejected} <span className="text-white/40">({s.rates.rejected}%)</span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-red-300">
                      {s.notSeen} <span className="text-white/40">({s.rates.notSeen}%)</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Section 5: Presets */}
      <section className="glass-card space-y-3 p-6">
        <header>
          <p className="hud-label">Presets</p>
          <h2 className="mt-1 text-[14px] font-semibold text-white">
            Salvos no seu navegador
          </h2>
        </header>
        <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
          <Input
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            placeholder="Nome do preset (ex: Hotmart · Produto X · Fevereiro)"
          />
          <Button type="button" onClick={handleSavePreset} variant="outline" size="sm">
            <Save className="h-3.5 w-3.5" />
            Salvar atual
          </Button>
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
          <select
            value={selectedPresetId}
            onChange={(e) => setSelectedPresetId(e.target.value)}
            className="flex h-11 w-full rounded-md border border-white/[0.10] bg-white/[0.04] px-4 text-[14px] text-white focus-visible:outline-none focus-visible:border-cyan-300/40"
          >
            <option value="">— Selecione um preset salvo —</option>
            {savedList.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.platform}
              </option>
            ))}
          </select>
          <Button
            type="button"
            onClick={handleLoadPreset}
            disabled={!selectedPresetId}
            variant="outline"
            size="sm"
          >
            <Upload className="h-3.5 w-3.5" />
            Carregar
          </Button>
          <Button
            type="button"
            onClick={handleDeletePreset}
            disabled={!selectedPresetId}
            variant="ghost"
            size="sm"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Excluir
          </Button>
        </div>
        <p className="text-[11px] text-white/40">
          Presets guardam plataforma, mapeamento de colunas, configuração do front e dos
          upsells. Os arquivos das planilhas precisam ser carregados de novo a cada uso.
        </p>
      </section>
    </div>
  );
}

// ---- sub-components ----

function FilePicker(props: {
  label: string;
  fileName: string;
  sheet: ParsedSheet | null;
  onFile: (f: File) => void;
}) {
  return (
    <div className="space-y-2">
      <Label className="hud-label">{props.label}</Label>
      <label className="flex cursor-pointer items-center gap-3 rounded-md border border-dashed border-white/[0.12] bg-white/[0.02] p-4 transition hover:border-cyan-300/40 hover:bg-cyan-300/[0.03]">
        <Upload className="h-4 w-4 text-cyan-300/70" />
        <div className="flex-1 text-[13px]">
          {props.fileName ? (
            <>
              <p className="font-semibold text-white/85">{props.fileName}</p>
              <p className="text-[11px] text-white/45">
                {props.sheet?.rows.length ?? 0} linhas · {props.sheet?.columns.length ?? 0} colunas
              </p>
            </>
          ) : (
            <p className="text-white/55">Clique para escolher arquivo</p>
          )}
        </div>
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) props.onFile(f);
          }}
        />
      </label>
    </div>
  );
}

function ColumnMapper(props: {
  title: string;
  sheet: ParsedSheet | null;
  cols: ColumnMap;
  onChange: (next: ColumnMap) => void;
  showStatus: boolean;
  showDateTime: boolean;
}) {
  const options = useMemo(() => props.sheet?.columns ?? [], [props.sheet]);
  if (!props.sheet) {
    return (
      <div className="rounded-md border border-white/[0.06] bg-black/20 p-4 text-[12px] text-white/40">
        {props.title}: faça upload do arquivo.
      </div>
    );
  }
  const fields: Array<{ key: keyof ColumnMap; label: string; show: boolean }> = [
    { key: 'customerId', label: 'ID Cliente', show: true },
    { key: 'product', label: 'Produto', show: true },
    { key: 'offer', label: 'Oferta', show: true },
    { key: 'status', label: 'Status', show: props.showStatus },
    { key: 'dateTime', label: 'Data/Hora', show: props.showDateTime },
  ];
  return (
    <div className="space-y-2">
      <p className="hud-label">{props.title}</p>
      {fields
        .filter((f) => f.show)
        .map((f) => (
          <div key={f.key} className="grid grid-cols-[120px_1fr] items-center gap-2">
            <Label className="text-[11px] uppercase tracking-[0.12em] text-white/55">
              {f.label}
            </Label>
            <select
              value={props.cols[f.key] ?? ''}
              onChange={(e) => props.onChange({ ...props.cols, [f.key]: e.target.value })}
              className="flex h-11 w-full rounded-md border border-white/[0.10] bg-white/[0.04] px-4 text-[14px] text-white focus-visible:outline-none focus-visible:border-cyan-300/40"
            >
              <option value="">— escolha —</option>
              {options.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        ))}
    </div>
  );
}

function FunnelRow(props: {
  step: FunnelStepConfig;
  onChange: (patch: Partial<FunnelStepConfig>) => void;
  onRemove?: () => void;
  tone?: 'front';
}) {
  const isFront = props.tone === 'front';
  return (
    <div
      className={`grid items-end gap-3 rounded-md border p-3 md:grid-cols-[80px_1fr_1fr_auto] ${
        isFront
          ? 'border-cyan-300/30 bg-cyan-300/[0.03]'
          : 'border-white/[0.06] bg-white/[0.02]'
      }`}
    >
      <div>
        <Label className="hud-label">Etapa</Label>
        <p
          className={`mt-1 text-[13px] font-semibold uppercase tracking-[0.14em] ${
            isFront ? 'text-cyan-300' : 'text-white/85'
          }`}
        >
          {props.step.name}
        </p>
      </div>
      <div>
        <Label className="hud-label">Produto</Label>
        <Input
          value={props.step.product}
          onChange={(e) => props.onChange({ product: e.target.value })}
          placeholder="(vazio = qualquer)"
        />
      </div>
      <div>
        <Label className="hud-label">Ofertas (vírgula)</Label>
        <Input
          value={props.step.offers.join(', ')}
          onChange={(e) =>
            props.onChange({
              offers: e.target.value
                .split(',')
                .map((o) => o.trim())
                .filter((o) => o.length > 0),
            })
          }
          placeholder="ex: OFF01, OFF01B"
        />
      </div>
      <div className="flex items-end">
        {props.onRemove && (
          <Button type="button" variant="ghost" size="sm" onClick={props.onRemove}>
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
