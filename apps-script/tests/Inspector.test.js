const { createInspector } = require('../src/Inspector');

test('records calls and asRows column order matches spec', () => {
  const insp = createInspector();
  insp.record({
    job: 'CalendarGET',
    dryRun: false,
    system: 'Smartsheet',
    operation: 'rows.add',
    method: 'POST',
    path: '/2.0/sheets/ss_demo/rows',
    request: { cells: [] },
    fakeResponse: { success: true, id: 'harness_0' },
    notes: 'CS_P-DEMO'
  });
  insp.record({
    job: 'CalendarGET',
    dryRun: true,
    system: 'Salesforce',
    operation: 'sobjects/pse__Assignment__c PATCH',
    method: 'PATCH',
    path: '/services/data/v60.0/sobjects/pse__Assignment__c',
    request: { pse__Project__c: 'P1' }
  });
  expect(insp.calls).toHaveLength(2);
  const rows = insp.asRows();
  expect(rows[0]).toEqual([
    expect.any(String),
    'CalendarGET',
    false,
    'Smartsheet',
    'rows.add',
    'POST',
    '/2.0/sheets/ss_demo/rows',
    JSON.stringify({ cells: [] }, null, 2),
    JSON.stringify({ success: true, id: 'harness_0' }, null, 2),
    'CS_P-DEMO'
  ]);
  expect(rows[1][3]).toBe('Salesforce');
  expect(rows[1][2]).toBe(true);
  expect(rows[1][7]).toContain('pse__Project__c');
});
