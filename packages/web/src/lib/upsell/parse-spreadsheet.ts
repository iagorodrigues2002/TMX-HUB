import * as XLSX from 'xlsx';

export interface ParsedSheet {
  /** Header row, in original order. */
  columns: string[];
  /** Each row as { columnName: stringValue }. All values are strings (we coerce). */
  rows: Array<Record<string, string>>;
  /** Sheet name we used (the first non-empty sheet). */
  sheetName: string;
}

/**
 * Reads an .xlsx, .xls, or .csv file and returns headers + rows. Always
 * normalizes values to trimmed strings so downstream comparison is simple.
 */
export async function parseSpreadsheet(file: File): Promise<ParsedSheet> {
  const buf = await file.arrayBuffer();
  // raw: false → XLSX formats numbers/dates to display strings (matches what
  // the user sees in Excel). cellDates ensures Date objects get a string repr.
  const wb = XLSX.read(buf, { type: 'array', cellDates: true, raw: false });
  const sheetName =
    wb.SheetNames.find((n) => {
      const s = wb.Sheets[n];
      return s && (s['!ref'] ?? '').length > 0;
    }) ?? wb.SheetNames[0];
  if (!sheetName) {
    throw new Error('A planilha está vazia.');
  }
  const sheet = wb.Sheets[sheetName];
  if (!sheet) {
    throw new Error(`Aba "${sheetName}" não encontrada.`);
  }

  // header: 1 returns rows as arrays so we can read the literal header row;
  // defval ensures empty cells become '' (not undefined).
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    blankrows: false,
  });
  if (aoa.length === 0) {
    return { columns: [], rows: [], sheetName };
  }

  const rawHeader = aoa[0] ?? [];
  const columns = rawHeader.map((h, i) => {
    const s = String(h ?? '').trim();
    // Some exports leave trailing empty headers — name them so they're at
    // least selectable in the column mapper.
    return s.length > 0 ? s : `Coluna ${i + 1}`;
  });

  const rows: Array<Record<string, string>> = [];
  for (let i = 1; i < aoa.length; i += 1) {
    const row = aoa[i] ?? [];
    const obj: Record<string, string> = {};
    for (let j = 0; j < columns.length; j += 1) {
      const col = columns[j] ?? `Coluna ${j + 1}`;
      const v = row[j];
      obj[col] = v === null || v === undefined ? '' : String(v).trim();
    }
    // Skip rows that are entirely empty.
    if (Object.values(obj).some((v) => v.length > 0)) {
      rows.push(obj);
    }
  }

  return { columns, rows, sheetName };
}
