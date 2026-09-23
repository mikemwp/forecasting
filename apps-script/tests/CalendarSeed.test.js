const {
  defaultSeedRows,
  buildCalendarInsert,
  importSeedEvents,
  normalizeSeedSheetRows,
  formatSeedImportToast,
  createSeedInsertApi
} = require('../src/CalendarSeed');

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

test('importSeedEvents records insert failures without counting created or skipped', () => {
  const api = {
    insert: function () {
      throw new Error('Calendar is not defined');
    }
  };
  const rows = defaultSeedRows(new Date('2026-09-23T12:00:00Z')).slice(0, 2);
  const result = importSeedEvents(rows, api, 'primary');
  expect(result.created).toBe(0);
  expect(result.skipped).toBe(0);
  expect(result.errors).toHaveLength(2);
  expect(result.errors[0].message).toMatch(/Calendar is not defined/);
});

test('normalizeSeedSheetRows skips blank titles and trims headers', () => {
  const rows = normalizeSeedSheetRows([
    { ' Calendar Title': 'Acme Kickoff', Company: 'Acme Ltd', 'Meeting Title': 'Kickoff workshop', Milestone: 'Kickoff', 'Project ID': 'P-DEMO', Start: '2026-09-24T09:00:00.000Z', 'Duration hours': 1, From: 'mikemwp@gmail.com', To: 'mikemwp@gmail.com', 'Google Event ID': '' },
    { 'Calendar Title': '', Start: '2026-09-25T09:00:00.000Z' }
  ]);
  expect(rows).toHaveLength(1);
  expect(rows[0].calendarTitle).toBe('Acme Kickoff');
  expect(rows[0].start instanceof Date).toBe(true);
});

test('formatSeedImportToast explains empty seed tab vs swallowed insert errors', () => {
  expect(formatSeedImportToast({ created: 0, skipped: 0, errors: [] }, 0)).toMatch(/No seed rows on Harness_CalendarSeed/);
  expect(formatSeedImportToast({
    created: 0,
    skipped: 0,
    errors: [{ index: 0, message: 'Calendar is not defined' }]
  }, 10)).toBe('Created 0, skipped 0, failed 1: Calendar is not defined');
});

test('createSeedInsertApi falls back to CalendarApp when advanced Calendar insert fails', () => {
  const advanced = {
    insert: function () {
      throw new Error('Calendar is not defined');
    }
  };
  const fallback = {
    calls: [],
    insert: function (calId, body) {
      this.calls.push({ calId: calId, summary: body.summary });
      return { id: 'app_evt_1' };
    }
  };
  const api = createSeedInsertApi({
    timeZone: 'Europe/London',
    calendarEventsInsert: function (resource, calId) {
      expect(resource.start.timeZone).toBe('Europe/London');
      expect(resource.end.timeZone).toBe('Europe/London');
      return advanced.insert(resource, calId);
    },
    calendarAppInsert: function (calId, body) {
      return fallback.insert(calId, body);
    }
  });
  const row = defaultSeedRows(new Date('2026-09-23T12:00:00Z'))[0];
  const result = importSeedEvents([row], api, 'primary');
  expect(result.created).toBe(1);
  expect(result.errors).toHaveLength(0);
  expect(fallback.calls).toHaveLength(1);
  expect(row.googleEventId).toBe('app_evt_1');
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
