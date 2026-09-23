const { importProject } = require('../src/ImportProject');
const { MemoryWorkbook } = require('../src/SheetIO');
const { HarnessSalesforceClient } = require('../src/SalesforceClient');
const { createInspector } = require('../src/Inspector');
const { Config } = require('../src/Config');

function setupImport() {
  var wb = new MemoryWorkbook();
  wb.ensureTab(Config.tabs.harnessProjects, ['Project ID', 'Company', 'Purchased hours', 'Salesforce Id']);
  wb.writeRow(Config.tabs.harnessProjects, ['P-DEMO', 'Acme Ltd', 40, 'sf_p_demo']);
  wb.ensureTab(Config.tabs.harnessMilestones, ['Project ID', 'Milestone', 'Hours']);
  ['Kickoff', 'Discovery'].forEach(function (m, i) {
    wb.writeRow(Config.tabs.harnessMilestones, ['P-DEMO', m, 8 + i]);
  });
  wb.ensureTab(Config.tabs.lookup, ['Milestone', 'Default Resource Type']);
  wb.writeRow(Config.tabs.lookup, ['Kickoff', 'Consultant']);
  wb.writeRow(Config.tabs.lookup, ['Discovery', 'Developer']);
  wb.ensureTab(Config.tabs.staffing, [
    'Project ID', 'Company Name', 'Total purchased hours', 'Milestone', 'Milestone hours',
    'Resource type', 'Request hours', 'Confirmed', 'Certinia Resource Request Id'
  ]);
  var inspector = createInspector();
  var salesforce = new HarnessSalesforceClient({ workbook: wb, inspector: inspector, job: 'Import', dryRun: false });
  return { wb: wb, salesforce: salesforce, inspector: inspector };
}

test('import fills milestone rows with default types', () => {
  var ctx = setupImport();
  importProject({
    projectId: 'P-DEMO',
    salesforce: ctx.salesforce,
    lookup: ctx.wb.readRows(Config.tabs.lookup),
    staffingTab: Config.tabs.staffing,
    workbook: ctx.wb,
    inspector: ctx.inspector,
    dryRun: false
  });
  var rows = ctx.wb.readRows(Config.tabs.staffing);
  expect(rows).toHaveLength(2);
  expect(rows[0]['Resource type']).toBe('Consultant');
  expect(rows[0]['Request hours']).toBe(8);
});

test('re-import preserves PM resource type override', () => {
  var ctx = setupImport();
  importProject({ projectId: 'P-DEMO', salesforce: ctx.salesforce, lookup: ctx.wb.readRows(Config.tabs.lookup), staffingTab: Config.tabs.staffing, workbook: ctx.wb, inspector: ctx.inspector, dryRun: false });
  var staffing = ctx.wb.getTab(Config.tabs.staffing);
  staffing.rows[0][staffing.headers.indexOf('Resource type')] = 'Architect';
  importProject({ projectId: 'P-DEMO', salesforce: ctx.salesforce, lookup: ctx.wb.readRows(Config.tabs.lookup), staffingTab: Config.tabs.staffing, workbook: ctx.wb, inspector: ctx.inspector, dryRun: false });
  expect(ctx.wb.readRows(Config.tabs.staffing)[0]['Resource type']).toBe('Architect');
});
