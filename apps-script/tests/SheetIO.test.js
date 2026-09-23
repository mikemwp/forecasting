const { MemoryWorkbook, createSpreadsheetWorkbook, FakeSpreadsheetAdapter } = require('../src/SheetIO');
const { Config } = require('../src/Config');

test('MemoryWorkbook upsertByKey updates existing row by key', () => {
  var wb = new MemoryWorkbook();
  wb.ensureTab('CS_P-DEMO', Config.consultationHeaders);
  wb.upsertByKey('CS_P-DEMO', 'Google Event ID', 'evt1', {
    'Google Event ID': 'evt1',
    'Consultation Name': 'Kickoff',
    'Status': ''
  });
  wb.upsertByKey('CS_P-DEMO', 'Google Event ID', 'evt1', {
    'Google Event ID': 'evt1',
    'Consultation Name': 'Kickoff',
    'Status': 'Cancelled'
  });
  var tab = wb.getTab('CS_P-DEMO');
  expect(tab.rows).toHaveLength(1);
  expect(tab.rows[0][tab.headers.indexOf('Status')]).toBe('Cancelled');
});

test('MemoryWorkbook overwriteTab replaces all rows', () => {
  var wb = new MemoryWorkbook();
  wb.writeRow('Forecast', ['old']);
  wb.overwriteTab('Forecast', [], [['banner'], ['h1', 'h2'], ['a', 'b']]);
  var tab = wb.getTab('Forecast');
  expect(tab.rows).toHaveLength(3);
  expect(tab.rows[0][0]).toBe('banner');
});

test('SpreadsheetWorkbook upsertByKey persists via fake adapter', () => {
  var adapter = new FakeSpreadsheetAdapter();
  var wb = createSpreadsheetWorkbook(adapter);
  wb.ensureTab('CS_P-DEMO', Config.consultationHeaders);
  wb.upsertByKey('CS_P-DEMO', 'Google Event ID', 'evt1', {
    'Google Event ID': 'evt1',
    'Consultation Name': 'Kickoff',
    'Status': ''
  });
  wb.upsertByKey('CS_P-DEMO', 'Google Event ID', 'evt1', {
    'Google Event ID': 'evt1',
    'Consultation Name': 'Kickoff updated',
    'Status': 'Cancelled'
  });
  var rows = wb.readObjects('CS_P-DEMO', 'Google Event ID');
  expect(rows['evt1']['Consultation Name']).toBe('Kickoff updated');
  expect(rows['evt1']['Status']).toBe('Cancelled');
  expect(Object.keys(rows)).toHaveLength(1);
});

test('SpreadsheetWorkbook overwriteTab persists via fake adapter', () => {
  var adapter = new FakeSpreadsheetAdapter();
  var wb = createSpreadsheetWorkbook(adapter);
  wb.overwriteTab(Config.tabs.forecast, [], [['banner'], ['Week', 'Hours'], ['2026-09-29', 8]]);
  var tab = wb.getTab(Config.tabs.forecast);
  expect(tab.rows[0][0]).toBe('banner');
  expect(tab.rows[2][1]).toBe(8);
});
