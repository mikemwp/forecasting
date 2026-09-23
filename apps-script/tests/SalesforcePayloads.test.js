const {
  isFuture,
  buildAssignmentUpserts,
  buildTimecardDeltas,
  buildResourceRequest,
  hourRules,
  HarnessSalesforceClient
} = require('../src/SalesforceClient');
const { createInspector } = require('../src/Inspector');
const { MemoryWorkbook } = require('../src/SheetIO');
const { Config } = require('../src/Config');

const now = new Date('2026-09-23T12:00:00Z');

function futureEvent(over) {
  return Object.assign({
    eventId: 'e1',
    projectId: 'P1',
    resourceCertiniaId: 'R1',
    resourceName: 'Amy',
    company: 'Acme',
    start: new Date('2026-10-01T09:00:00Z'),
    end: new Date('2026-10-01T10:00:00Z'),
    hours: 1,
    milestone: 'Kickoff',
    cancelled: false
  }, over);
}

test('isFuture when end after now', () => {
  expect(isFuture(futureEvent(), now)).toBe(true);
  expect(isFuture(futureEvent({ end: new Date('2026-09-20T10:00:00Z') }), now)).toBe(false);
});

test('two future meetings same person same week sum hours', () => {
  var events = [
    futureEvent({ eventId: 'e1', start: new Date('2026-09-28T09:00:00Z'), end: new Date('2026-09-28T10:00:00Z') }),
    futureEvent({ eventId: 'e2', start: new Date('2026-09-29T09:00:00Z'), end: new Date('2026-09-29T10:00:00Z') })
  ];
  var payloads = buildAssignmentUpserts(events, now);
  expect(payloads).toHaveLength(1);
  var slices = payloads[0].scheduleSlices;
  expect(slices.filter(function (s) { return s.googleEventId === 'e1'; })[0].hours).toBe(1);
  expect(slices.filter(function (s) { return s.googleEventId === 'e2'; })[0].hours).toBe(1);
});

test('completed meeting produces timecard not assignment', () => {
  var completed = futureEvent({
    eventId: 'done1',
    start: new Date('2026-09-21T09:00:00Z'),
    end: new Date('2026-09-21T10:00:00Z')
  });
  var fromResource = { certiniaId: 'PM1', name: 'Mike' };
  var assignments = buildAssignmentUpserts([completed], now);
  var timecards = buildTimecardDeltas([completed], fromResource, [], now);
  expect(assignments).toHaveLength(0);
  expect(timecards).toHaveLength(1);
  expect(timecards[0].weekday).toBe('Monday');
});

test('missing From produces no timecard', () => {
  var completed = futureEvent({
    start: new Date('2026-09-21T09:00:00Z'),
    end: new Date('2026-09-21T10:00:00Z')
  });
  expect(buildTimecardDeltas([completed], null, [], now)).toHaveLength(0);
});

test('hourRules blocks over-allocation', () => {
  var rows = [
    { projectId: 'P1', milestone: 'Kickoff', milestoneHours: 8, requestHours: 10, confirmed: true }
  ];
  var r = hourRules(rows);
  expect(r.ok).toBe(false);
});

test('hourRules allows valid allocation', () => {
  var rows = [
    { projectId: 'P1', milestone: 'Kickoff', milestoneHours: 8, requestHours: 8, confirmed: true },
    { projectId: 'P1', milestone: 'Discovery', milestoneHours: 8, requestHours: 4, confirmed: true }
  ];
  expect(hourRules(rows).ok).toBe(true);
});

test('buildResourceRequest is Draft', () => {
  var rr = buildResourceRequest({
    projectId: 'P1',
    resourceType: 'Consultant',
    requestHours: 8
  });
  expect(rr.pse__Status__c).toBe('Draft');
  expect(rr.pse__Project__c).toBe('P1');
});

test('harness client dryRun records inspector without writing assignments tab', () => {
  var wb = new MemoryWorkbook();
  wb.ensureTab('Harness_Assignments', ['Project ID', 'Resource Id', 'Event ID', 'Date', 'Hours']);
  var inspector = createInspector();
  var client = new HarnessSalesforceClient({ workbook: wb, inspector: inspector, job: 'CalendarGET', dryRun: true });
  client.upsertAssignments(buildAssignmentUpserts([futureEvent()], now));
  expect(inspector.calls.length).toBeGreaterThan(0);
  expect(wb.getTab('Harness_Assignments').rows.length).toBe(0);
});

test('assignment chunks are at most 50', () => {
  var events = [];
  for (var i = 0; i < 55; i++) {
    events.push(futureEvent({
      eventId: 'e' + i,
      resourceCertiniaId: 'R' + i,
      projectId: 'P' + i
    }));
  }
  var chunks = HarnessSalesforceClient.chunkPayloads(buildAssignmentUpserts(events, now), Config.DML_CHUNK);
  expect(chunks.length).toBeGreaterThan(1);
  chunks.forEach(function (c) { expect(c.length).toBeLessThanOrEqual(50); });
});
