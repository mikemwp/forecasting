const { defaultSeedRows, buildCalendarInsert, importSeedEvents } = require('../src/CalendarSeed');

test('defaultSeedRows is 10 future timed events with mike as from and to', () => {
  const now = new Date('2026-09-23T12:00:00+01:00');
  const rows = defaultSeedRows(now);
  expect(rows).toHaveLength(10);
  rows.forEach(function (r) {
    expect(r.from).toBe('mikemwp@gmail.com');
    expect(r.to).toBe('mikemwp@gmail.com');
    expect(r.projectId).toBe('P-DEMO');
    expect(r.company).toBe('Acme Ltd');
    expect(r.durationHours).toBe(1);
    expect(new Date(r.start).getTime()).toBeGreaterThan(now.getTime());
  });
  expect(rows.filter(function (r) { return r.milestone === 'Build'; }).length).toBe(2);
});

test('buildCalendarInsert uses pipe description and attendees from To', () => {
  const payload = buildCalendarInsert({
    calendarTitle: 'Acme Kickoff',
    company: 'Acme Ltd',
    meetingTitle: 'Kickoff workshop',
    milestone: 'Kickoff',
    projectId: 'P-DEMO',
    start: new Date('2026-09-24T09:00:00Z'),
    durationHours: 1,
    from: 'mikemwp@gmail.com',
    to: 'other@co.com'
  });
  expect(payload.summary).toBe('Acme Kickoff');
  expect(payload.description).toBe('Acme Ltd|Kickoff workshop|Kickoff|P-DEMO');
  expect(payload.attendees).toEqual([{ email: 'other@co.com' }]);
  expect(payload.end.getTime() - payload.start.getTime()).toBe(3600000);
});

test('import skips rows that already have Google Event ID', () => {
  const created = [];
  const api = {
    insert: function (calId, body) {
      created.push(body);
      return { id: 'evt_' + created.length };
    }
  };
  const rows = defaultSeedRows(new Date('2026-09-23T12:00:00Z'));
  rows[0].googleEventId = 'already';
  const result = importSeedEvents(rows, api, 'primary');
  expect(result.created).toBe(9);
  expect(result.skipped).toBe(1);
  expect(created).toHaveLength(9);
  expect(rows[1].googleEventId).toBe('evt_1');
});

test('edited From/To on the row are what get sent', () => {
  const row = defaultSeedRows(new Date('2026-09-23T12:00:00Z'))[0];
  row.from = 'pm2@co.com';
  row.to = 'consultant@co.com';
  const payload = buildCalendarInsert(row);
  expect(payload.attendees[0].email).toBe('consultant@co.com');
});

test('two Build meetings share the same weekStart Monday', () => {
  const { weekStart } = require('../src/Week');
  const now = new Date('2026-09-22T14:00:00+01:00');
  const rows = defaultSeedRows(now);
  const build = rows.filter(function (r) { return r.milestone === 'Build'; });
  expect(build).toHaveLength(2);
  const ws0 = weekStart(new Date(build[0].start), 'Monday');
  const ws1 = weekStart(new Date(build[1].start), 'Monday');
  expect(ws0.getTime()).toBe(ws1.getTime());
});
