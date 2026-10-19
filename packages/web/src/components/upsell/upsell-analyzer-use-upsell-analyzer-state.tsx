'use client';

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
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { EMPTY_COLS } from './upsell-analyzer-support';

export function useUpsellAnalyzerState() {
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
  const removeStep = (i: number) => setSteps((prev) => prev.filter((_, idx) => idx !== i));
  const updateStep = (i: number, patch: Partial<FunnelStepConfig>) =>
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  return {
    platform,
    setPlatform,
    frontSheet,
    upsellSheet,
    frontFileName,
    upsellFileName,
    frontCols,
    setFrontCols,
    upsellCols,
    setUpsellCols,
    frontConfig,
    setFrontConfig,
    steps,
    results,
    savedList,
    presetName,
    setPresetName,
    selectedPresetId,
    setSelectedPresetId,
    handleFile,
    canCalculate,
    handleCalculate,
    handleSavePreset,
    handleLoadPreset,
    handleDeletePreset,
    addStep,
    removeStep,
    updateStep,
  };
}
