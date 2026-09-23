const { MemoryWorkbook } = require('../src/SheetIO');
const { createInspector } = require('../src/Inspector');
const { Config } = require('../src/Config');
const { defaultSeedRows, importSeedEvents, seedRowToSheet, SEED_HEADERS } = require('../src/CalendarSeed');
const { flushInspectorToWorkbook } = require('../src/SheetIO');
const {
  persistSeedGoogleEventIds,
  runImportWithFlush,
  runCreateRRWithFlush
} = require('../src/GasAdapters');
const { HarnessSalesforceClient } = require('../src/SalesforceClient');

test('flushInspectorToWorkbook writes inspector rows to API_Inspector tab', () => {
  var wb = new MemoryWorkbook();
  var inspector = createInspector();
  inspector.record({ job: 'Import', dryRun: false, system: 'Salesforce', operation: 'query', method: 'GET', path: '/query', request: {} });
  flushInspectorToWorkbook(wb, inspector);
  var rows = wb.readRows(Config.tabs.apiInspector);
  expect(rows.length).toBe(1);
  expect(rows[0]['Job']).toBe('Import');
});

test('persistSeedGoogleEventIds writes Google Event ID back to seed tab', () => {
  var wb = new MemoryWorkbook();
  wb.ensureTab(Config.tabs.calendarSeed, SEED_HEADERS);
  var seedRows = defaultSeedRows(new Date('2026-09-23T12:00:00Z'));
  seedRows.forEach(function (r) { wb.writeRow(Config.tabs.calendarSeed, seedRowToSheet(r)); });
  var api = {
    insert: function (calId, body) { return { id: 'google_evt_' + body.summary }; }
  };
  var result = importSeedEvents(seedRows, api, 'primary');
  persistSeedGoogleEventIds(wb, seedRows);
  var stored = wb.readRows(Config.tabs.calendarSeed);
  expect(result.created).toBe(10);
  expect(stored[0]['Google Event ID']).toBeTruthy();
  expect(stored.filter(function (r) { return r['Google Event ID']; }).length).toBe(10);
});

test('runCreateRRWithFlush persists Certinia Resource Request Id on staffing board', () => {
  var wb = new MemoryWorkbook();
  wb.ensureTab(Config.tabs.staffing, [
    'Project ID', 'Company Name', 'Total purchased hours', 'Milestone', 'Milestone hours',
    'Resource type', 'Request hours', 'Confirmed', 'Certinia Resource Request Id'
  ]);
  wb.writeRow(Config.tabs.staffing, ['P-DEMO', 'Acme', 40, 'Kickoff', 8, 'Consultant', 8, true, '']);
  wb.ensureTab(Config.tabs.apiInspector, ['Timestamp', 'Job', 'Dry-run', 'System', 'Operation', 'Method', 'Path', 'Request JSON', 'Fake response JSON', 'Notes']);
  var inspector = createInspector();
  var salesforce = new HarnessSalesforceClient({ workbook: wb, inspector: inspector, job: 'CreateRR', dryRun: false });
  runCreateRRWithFlush(wb, inspector, salesforce, false);
  var staffing = wb.readRows(Config.tabs.staffing);
  expect(staffing[0]['Certinia Resource Request Id']).toMatch(/harness_rr/);
  expect(wb.readRows(Config.tabs.apiInspector).length).toBeGreaterThan(0);
});

test('runImportWithFlush writes inspector rows after import', () => {
  var wb = new MemoryWorkbook();
  wb.ensureTab(Config.tabs.harnessProjects, ['Project ID', 'Company', 'Purchased hours', 'Salesforce Id']);
  wb.writeRow(Config.tabs.harnessProjects, ['P-DEMO', 'Acme Ltd', 40, 'sf_p_demo']);
  wb.ensureTab(Config.tabs.harnessMilestones, ['Project ID', 'Milestone', 'Hours']);
  wb.writeRow(Config.tabs.harnessMilestones, ['P-DEMO', 'Kickoff', 8]);
  wb.ensureTab(Config.tabs.lookup, ['Milestone', 'Default Resource Type']);
  wb.writeRow(Config.tabs.lookup, ['Kickoff', 'Consultant']);
  wb.ensureTab(Config.tabs.staffing, [
    'Project ID', 'Company Name', 'Total purchased hours', 'Milestone', 'Milestone hours',
    'Resource type', 'Request hours', 'Confirmed', 'Certinia Resource Request Id'
  ]);
  wb.ensureTab(Config.tabs.apiInspector, ['Timestamp', 'Job', 'Dry-run', 'System', 'Operation', 'Method', 'Path', 'Request JSON', 'Fake response JSON', 'Notes']);
  var inspector = createInspector();
  var salesforce = new HarnessSalesforceClient({ workbook: wb, inspector: inspector, job: 'Import', dryRun: false });
  runImportWithFlush(wb, inspector, salesforce, 'P-DEMO', false);
  expect(wb.readRows(Config.tabs.apiInspector).length).toBeGreaterThan(0);
});
