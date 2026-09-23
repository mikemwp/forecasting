const { MemoryWorkbook } = require('../src/SheetIO');
const { HarnessSmartsheetClient } = require('../src/SmartsheetClient');
const { createInspector } = require('../src/Inspector');
const { Config } = require('../src/Config');

function setupWorkbook() {
  var wb = new MemoryWorkbook();
  wb.ensureTab(Config.tabs.projectIndex, ['Project ID', 'Tab name', 'Fake Smartsheet ID']);
  wb.writeRow(Config.tabs.projectIndex, ['P1', 'CS_P1', 'ss_p1']);
  wb.ensureTab('CS_P1', Config.consultationHeaders);
  return wb;
}

function makeClient(wb, dryRun) {
  var inspector = createInspector();
  var client = new HarnessSmartsheetClient({ workbook: wb, inspector: inspector, job: 'CalendarGET', dryRun: !!dryRun });
  return { client: client, inspector: inspector, wb: wb };
}

function sampleIncoming() {
  return {
    eventId: 'evt1',
    title: 'Kickoff',
    body: 'Acme|Kickoff|Kickoff|P1',
    start: new Date('2026-10-01T09:00:00Z'),
    end: new Date('2026-10-01T10:00:00Z'),
    milestone: 'Kickoff',
    resourceLabel: 'Amy',
    hours: 1
  };
}

test('unknown project returns null', () => {
  var wb = setupWorkbook();
  var client = makeClient(wb).client;
  expect(client.resolveProject('UNKNOWN')).toBeNull();
});

test('first applyDiff insert creates consultation row on CS_P1', () => {
  var wb = setupWorkbook();
  var ctx = makeClient(wb);
  var diff = { inserts: [sampleIncoming()], fieldUpdates: [], cancellations: [] };
  ctx.client.applyDiff('P1', diff);
  var rows = ctx.wb.readObjects('CS_P1', 'Google Event ID');
  expect(rows['evt1']).toBeDefined();
  expect(rows['evt1']['Consultation Name']).toBe('Kickoff');
});

test('second identical applyDiff does not duplicate', () => {
  var wb = setupWorkbook();
  var ctx = makeClient(wb);
  var diff = { inserts: [sampleIncoming()], fieldUpdates: [], cancellations: [] };
  ctx.client.applyDiff('P1', diff);
  ctx.client.applyDiff('P1', { inserts: [], fieldUpdates: [], cancellations: [] });
  var tab = ctx.wb.getTab('CS_P1');
  expect(tab.rows.length).toBe(1);
});

test('dryRun records inspector row but CS_P1 row count unchanged', () => {
  var wb = setupWorkbook();
  var ctx = makeClient(wb, true);
  var diff = { inserts: [sampleIncoming()], fieldUpdates: [], cancellations: [] };
  ctx.client.applyDiff('P1', diff);
  expect(ctx.wb.getTab('CS_P1').rows.length).toBe(0);
  expect(ctx.inspector.calls.length).toBeGreaterThan(0);
  expect(ctx.inspector.calls[0].dryRun).toBe(true);
});

test('TEST_MODE client never exposes urlFetch', () => {
  var wb = setupWorkbook();
  var client = makeClient(wb).client;
  expect(client.urlFetch).toBeUndefined();
});
