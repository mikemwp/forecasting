const { createResourceRequests } = require('../src/CreateResourceRequests');
const { MemoryWorkbook } = require('../src/SheetIO');
const { HarnessSalesforceClient } = require('../src/SalesforceClient');
const { createInspector } = require('../src/Inspector');
const { Config } = require('../src/Config');

function staffingRow(over) {
  return Object.assign({
    projectId: 'P-DEMO',
    milestone: 'Kickoff',
    milestoneHours: 8,
    resourceType: 'Consultant',
    requestHours: 8,
    confirmed: false,
    certiniaResourceRequestId: ''
  }, over);
}

test('create without confirmed produces no Salesforce payload', () => {
  var wb = new MemoryWorkbook();
  var inspector = createInspector();
  var salesforce = new HarnessSalesforceClient({ workbook: wb, inspector: inspector, job: 'CreateRR', dryRun: false });
  var result = createResourceRequests({
    staffingRows: [staffingRow({ confirmed: false })],
    salesforce: salesforce,
    inspector: inspector,
    dryRun: false,
    errorLog: { append: function () {} }
  });
  expect(inspector.calls.length).toBe(0);
  expect(result.created).toBe(0);
});

test('create with confirmed writes fake id via callback', () => {
  var wb = new MemoryWorkbook();
  var inspector = createInspector();
  var salesforce = new HarnessSalesforceClient({ workbook: wb, inspector: inspector, job: 'CreateRR', dryRun: false });
  var row = staffingRow({ confirmed: true });
  var result = createResourceRequests({
    staffingRows: [row],
    salesforce: salesforce,
    inspector: inspector,
    dryRun: false,
    errorLog: { append: function () {} }
  });
  expect(inspector.calls.length).toBe(1);
  expect(result.ids[0]).toMatch(/harness_rr/);
});

test('over-hours blocks create', () => {
  var wb = new MemoryWorkbook();
  var inspector = createInspector();
  var salesforce = new HarnessSalesforceClient({ workbook: wb, inspector: inspector, job: 'CreateRR', dryRun: false });
  var errors = [];
  var result = createResourceRequests({
    staffingRows: [staffingRow({ confirmed: true, requestHours: 20 })],
    salesforce: salesforce,
    inspector: inspector,
    dryRun: false,
    errorLog: { append: function (e) { errors.push(e); } }
  });
  expect(result.created).toBe(0);
  expect(errors.length).toBeGreaterThan(0);
});

test('dryRun create records inspector only', () => {
  var wb = new MemoryWorkbook();
  var inspector = createInspector();
  var salesforce = new HarnessSalesforceClient({ workbook: wb, inspector: inspector, job: 'CreateRR', dryRun: true });
  var row = staffingRow({ confirmed: true });
  createResourceRequests({
    staffingRows: [row],
    salesforce: salesforce,
    inspector: inspector,
    dryRun: true,
    errorLog: { append: function () {} }
  });
  expect(inspector.calls.length).toBe(1);
  expect(inspector.calls[0].dryRun).toBe(true);
  expect(row.certiniaResourceRequestId).toBe('');
});

test('existing certiniaResourceRequestId triggers update not insert', () => {
  var wb = new MemoryWorkbook();
  var inspector = createInspector();
  var salesforce = new HarnessSalesforceClient({ workbook: wb, inspector: inspector, job: 'CreateRR', dryRun: false });
  createResourceRequests({
    staffingRows: [staffingRow({ confirmed: true, certiniaResourceRequestId: 'rr_existing' })],
    salesforce: salesforce,
    inspector: inspector,
    dryRun: false,
    errorLog: { append: function () {} }
  });
  expect(inspector.calls.length).toBe(1);
  expect(inspector.calls[0].method).toBe('PATCH');
  expect(inspector.calls[0].path).toMatch(/rr_existing/);
});

test('rerun with same id still PATCHes not POST', () => {
  var wb = new MemoryWorkbook();
  var inspector = createInspector();
  var salesforce = new HarnessSalesforceClient({ workbook: wb, inspector: inspector, job: 'CreateRR', dryRun: false });
  var row = staffingRow({ confirmed: true, certiniaResourceRequestId: 'rr_existing' });
  createResourceRequests({
    staffingRows: [row],
    salesforce: salesforce,
    inspector: inspector,
    dryRun: false,
    errorLog: { append: function () {} }
  });
  expect(row.certiniaResourceRequestId).toBe('rr_existing');
  expect(inspector.calls.every(function (c) { return c.method === 'PATCH'; })).toBe(true);
});
