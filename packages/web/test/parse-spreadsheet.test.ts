import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as XLSX from 'xlsx';
import { parseSpreadsheet } from '../src/lib/upsell/parse-spreadsheet';

for (const bookType of ['xlsx', 'biff8', 'csv'] as const) {
  test(`imports ${bookType} without changing the upsell column/row contract`, async () => {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      book,
      XLSX.utils.aoa_to_sheet([
        [' Cliente ', 'Status', '', 'Valor'],
        [' Ana ', ' approved ', ' extra ', 12.5],
        ['', '', '', ''],
      ]),
      'Vendas',
    );
    const bytes = XLSX.write(book, { type: 'array', bookType });
    const result = await parseSpreadsheet(new File([bytes], `vendas.${bookType}`));
    assert.deepEqual(result.columns, ['Cliente', 'Status', 'Coluna 3', 'Valor']);
    assert.equal(result.rows.length, 1);
    assert.deepEqual(
      { ...result.rows[0] },
      {
        Cliente: 'Ana',
        Status: 'approved',
        'Coluna 3': 'extra',
        Valor: '12.5',
      },
    );
    assert.equal(typeof result.sheetName, 'string');
  });
}

test('spreadsheet headers cannot change a row prototype or drop reserved column names', async () => {
  const result = await parseSpreadsheet(
    new File(['__proto__,constructor,cliente\nvalor,outra,Ana'], 'headers.csv'),
  );
  assert.equal(Object.getPrototypeOf(result.rows[0]), null);
  assert.equal(Object.hasOwn(result.rows[0], '__proto__'), true);
  assert.equal(result.rows[0].__proto__, 'valor');
  assert.equal(result.rows[0].constructor, 'outra');
  assert.equal(Object.getPrototypeOf({}), Object.prototype);
});

test('an empty worksheet retains the empty-result contract', async () => {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([]), 'Vazia');
  const bytes = XLSX.write(book, { type: 'array', bookType: 'xlsx' });
  const result = await parseSpreadsheet(new File([bytes], 'empty.xlsx'));
  assert.deepEqual(result, { columns: [], rows: [], sheetName: 'Vazia' });
});
