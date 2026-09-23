const { runCalendarGet } = require('../src/CalendarGet');
const { MemoryWorkbook } = require('../src/SheetIO');
const { HarnessSmartsheetClient } = require('../src/SmartsheetClient');
const { HarnessSalesforceClient } = require('../src/SalesforceClient');
const { createInspector } = require('../src/Inspector');
const { Config } = require('../src/Config');

const now = new Date('2026-09-23T12:00:00Z');

function setupHarness() {
  var wb = new MemoryWorkbook();
  wb.ensureTab(Config.tabs.projectIndex, ['Project ID', 'Tab name', 'Fake Smartsheet ID']);
  wb.writeRow(Config.tabs.projectIndex, ['P-DEMO', 'CS_P-DEMO', 'ss_demo']);
  wb.ensureTab('CS_P-DEMO', Config.consultationHeaders);
  wb.ensureTab(Config.tabs.companies, ['Company']);
  wb.writeRow(Config.tabs.companies, ['Acme Ltd']);
  wb.ensureTab(Config.tabs.milestones, ['Milestone']);
  wb.writeRow(Config.tabs.milestones, ['Kickoff']);
  wb.ensureTab(Config.tabs.resourceEmails, ['Email', 'Name', 'Certinia Resource Id']);
  wb.writeRow(Config.tabs.resourceEmails, ['mikemwp@gmail.com', 'Mike', 'R_MIKE']);
  wb.ensureTab(Config.tabs.forecast, []);
  wb.ensureTab(Config.tabs.apiInspector, ['Timestamp', 'Job', 'Dry-run', 'System', 'Operation', 'Method', 'Path', 'Request JSON', 'Fake response JSON', 'Notes']);
  var inspector = createInspector();
  var smartsheet = new HarnessSmartsheetClient({ workbook: wb, inspector: inspector, job: 'CalendarGET', dryRun: false });
  var salesforce = new HarnessSalesforceClient({ workbook: wb, inspector: inspector, job: 'CalendarGET', dryRun: false });
  var errorLog = [];
  return {
    wb: wb,
    inspector: inspector,
    smartsheet: smartsheet,
    salesforce: salesforce,
    errorLog: {
      append: function (entry) { errorLog.push(entry); },
      entries: errorLog
    }
  };
}

function validEvent(over) {
  return Object.assign({
    id: 'evt1',
    title: 'Acme Kickoff',
    body: 'Acme Ltd|Kickoff workshop|Kickoff|P-DEMO',
    start: new Date('2026-10-01T09:00:00Z'),
    end: new Date('2026-10-01T10:00:00Z'),
    isAllDay: false,
    organizerEmail: 'mikemwp@gmail.com',
    attendeeEmails: ['mikemwp@gmail.com']
  }, over);
}

test('valid event inserts CS row and logs Smartsheet and Salesforce inspector calls', () => {
  var ctx = setupHarness();
  runCalendarGet({
    now: now,
    events: [validEvent()],
    companies: ['Acme Ltd'],
    milestones: ['Kickoff'],
    resources: [{ email: 'mikemwp@gmail.com', name: 'Mike', certiniaId: 'R_MIKE' }],
    smartsheet: ctx.smartsheet,
    salesforce: ctx.salesforce,
    inspector: ctx.inspector,
    errorLog: ctx.errorLog,
    dryRun: false,
    job: 'CalendarGET',
    remainingMs: 300000,
    workbook: ctx.wb
  });
  var cs = ctx.wb.readObjects('CS_P-DEMO', 'Google Event ID');
  expect(cs['evt1']).toBeDefined();
  expect(ctx.inspector.calls.some(function (c) { return c.system === 'Smartsheet'; })).toBe(true);
  expect(ctx.inspector.calls.some(function (c) { return c.system === 'Salesforce'; })).toBe(true);
  var forecast = ctx.wb.getTab(Config.tabs.forecast);
  expect(forecast.rows.some(function (r) { return r[0] === 'P-DEMO'; })).toBe(true);
});

test('bad company logs error and skips CS row', () => {
  var ctx = setupHarness();
  runCalendarGet({
    now: now,
    events: [validEvent({ body: 'BadCo|Title|Kickoff|P-DEMO' })],
    companies: ['Acme Ltd'],
    milestones: ['Kickoff'],
    resources: [{ email: 'mikemwp@gmail.com', name: 'Mike', certiniaId: 'R_MIKE' }],
    smartsheet: ctx.smartsheet,
    salesforce: ctx.salesforce,
    inspector: ctx.inspector,
    errorLog: ctx.errorLog,
    dryRun: false,
    workbook: ctx.wb,
    remainingMs: 300000
  });
  expect(ctx.errorLog.entries.length).toBeGreaterThan(0);
  expect(Object.keys(ctx.wb.readObjects('CS_P-DEMO', 'Google Event ID')).length).toBe(0);
});

test('unknown project id logs error', () => {
  var ctx = setupHarness();
  runCalendarGet({
    now: now,
    events: [validEvent({ body: 'Acme Ltd|Title|Kickoff|UNKNOWN' })],
    companies: ['Acme Ltd'],
    milestones: ['Kickoff'],
    resources: [{ email: 'mikemwp@gmail.com', name: 'Mike', certiniaId: 'R_MIKE' }],
    smartsheet: ctx.smartsheet,
    salesforce: ctx.salesforce,
    inspector: ctx.inspector,
    errorLog: ctx.errorLog,
    dryRun: false,
    workbook: ctx.wb,
    remainingMs: 300000
  });
  expect(ctx.errorLog.entries.some(function (e) { return /UNKNOWN|project/i.test(e.reason); })).toBe(true);
});

test('all-day event logs error', () => {
  var ctx = setupHarness();
  runCalendarGet({
    now: now,
    events: [validEvent({ isAllDay: true })],
    companies: ['Acme Ltd'],
    milestones: ['Kickoff'],
    resources: [{ email: 'mikemwp@gmail.com', name: 'Mike', certiniaId: 'R_MIKE' }],
    smartsheet: ctx.smartsheet,
    salesforce: ctx.salesforce,
    inspector: ctx.inspector,
    errorLog: ctx.errorLog,
    dryRun: false,
    workbook: ctx.wb,
    remainingMs: 300000
  });
  expect(ctx.errorLog.entries.length).toBeGreaterThan(0);
});

test('completed event with From produces timecard not assignment', () => {
  var ctx = setupHarness();
  runCalendarGet({
    now: now,
    events: [validEvent({
      start: new Date('2026-09-21T09:00:00Z'),
      end: new Date('2026-09-21T10:00:00Z')
    })],
    companies: ['Acme Ltd'],
    milestones: ['Kickoff'],
    resources: [{ email: 'mikemwp@gmail.com', name: 'Mike', certiniaId: 'R_MIKE' }],
    smartsheet: ctx.smartsheet,
    salesforce: ctx.salesforce,
    inspector: ctx.inspector,
    errorLog: ctx.errorLog,
    dryRun: false,
    workbook: ctx.wb,
    remainingMs: 300000
  });
  var sfCalls = ctx.inspector.calls.filter(function (c) { return c.system === 'Salesforce'; });
  expect(sfCalls.some(function (c) { return c.operation.indexOf('Timecard') >= 0; })).toBe(true);
  expect(sfCalls.some(function (c) {
    return c.operation.indexOf('composite') >= 0 && JSON.stringify(c.requestJson || c).indexOf('evt1') >= 0;
  })).toBe(false);
});

test('completed event missing From still inserts CS but logs error for timecard', () => {
  var ctx = setupHarness();
  runCalendarGet({
    now: now,
    events: [validEvent({
      start: new Date('2026-09-21T09:00:00Z'),
      end: new Date('2026-09-21T10:00:00Z'),
      organizerEmail: 'unknown@x.com'
    })],
    companies: ['Acme Ltd'],
    milestones: ['Kickoff'],
    resources: [{ email: 'mikemwp@gmail.com', name: 'Mike', certiniaId: 'R_MIKE' }],
    smartsheet: ctx.smartsheet,
    salesforce: ctx.salesforce,
    inspector: ctx.inspector,
    errorLog: ctx.errorLog,
    dryRun: false,
    workbook: ctx.wb,
    remainingMs: 300000
  });
  expect(ctx.wb.readObjects('CS_P-DEMO', 'Google Event ID')['evt1']).toBeDefined();
  expect(ctx.errorLog.entries.some(function (e) { return /from|organizer/i.test(e.reason); })).toBe(true);
});

test('dryRun leaves CS unchanged but inspector has dryRun true', () => {
  var ctx = setupHarness();
  var drySm = new HarnessSmartsheetClient({ workbook: ctx.wb, inspector: ctx.inspector, job: 'CalendarGET', dryRun: true });
  var drySf = new HarnessSalesforceClient({ workbook: ctx.wb, inspector: ctx.inspector, job: 'CalendarGET', dryRun: true });
  runCalendarGet({
    now: now,
    events: [validEvent()],
    companies: ['Acme Ltd'],
    milestones: ['Kickoff'],
    resources: [{ email: 'mikemwp@gmail.com', name: 'Mike', certiniaId: 'R_MIKE' }],
    smartsheet: drySm,
    salesforce: drySf,
    inspector: ctx.inspector,
    errorLog: ctx.errorLog,
    dryRun: true,
    workbook: ctx.wb,
    remainingMs: 300000
  });
  expect(ctx.wb.getTab('CS_P-DEMO').rows.length).toBe(0);
  expect(ctx.inspector.calls.every(function (c) { return c.dryRun === true; })).toBe(true);
});

test('second run does not duplicate event id', () => {
  var ctx = setupHarness();
  var opts = {
    now: now,
    events: [validEvent()],
    companies: ['Acme Ltd'],
    milestones: ['Kickoff'],
    resources: [{ email: 'mikemwp@gmail.com', name: 'Mike', certiniaId: 'R_MIKE' }],
    smartsheet: ctx.smartsheet,
    salesforce: ctx.salesforce,
    inspector: ctx.inspector,
    errorLog: ctx.errorLog,
    dryRun: false,
    workbook: ctx.wb,
    remainingMs: 300000
  };
  runCalendarGet(opts);
  runCalendarGet(opts);
  expect(ctx.wb.getTab('CS_P-DEMO').rows.length).toBe(1);
});
