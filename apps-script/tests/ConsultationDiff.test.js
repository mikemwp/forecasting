const { consultationDiff } = require('../src/ConsultationDiff');

const now = new Date('2026-09-23T12:00:00Z');
const future = new Date('2026-10-01T09:00:00Z');
const futureEnd = new Date('2026-10-01T10:00:00Z');

function incoming(over) {
  return Object.assign({
    eventId: 'e1',
    title: 'Consult',
    body: 'Acme|Consult|Kickoff|P1',
    start: future,
    end: futureEnd,
    milestone: 'Kickoff',
    resourceLabel: 'Amy',
    hours: 1,
    cancelledOnCalendar: false
  }, over);
}

test('unknown event id inserts', () => {
  const d = consultationDiff({}, [incoming()], now, { timeMin: now, timeMax: new Date('2026-12-31') });
  expect(d.inserts).toHaveLength(1);
  expect(d.inserts[0].eventId).toBe('e1');
});

test('unchanged event is not rewritten', () => {
  const exist = { e1: { eventId: 'e1', start: future, end: futureEnd, milestone: 'Kickoff', resourceLabel: 'Amy', status: '' } };
  const d = consultationDiff(exist, [incoming()], now, { timeMin: now, timeMax: new Date('2026-12-31') });
  expect(d.fieldUpdates).toHaveLength(0);
  expect(d.unchangedIds).toContain('e1');
});

test('start change updates date time duration only', () => {
  const exist = { e1: { eventId: 'e1', start: future, end: futureEnd, milestone: 'Kickoff', resourceLabel: 'Amy', status: '' } };
  const newStart = new Date('2026-10-02T09:00:00Z');
  const newEnd = new Date('2026-10-02T10:00:00Z');
  const d = consultationDiff(exist, [incoming({ start: newStart, end: newEnd })], now, { timeMin: now, timeMax: new Date('2026-12-31') });
  expect(d.fieldUpdates[0].fields).toEqual(['Start Date', 'Start Time', 'Duration']);
});

test('To change updates Resource', () => {
  const exist = { e1: { eventId: 'e1', start: future, end: futureEnd, milestone: 'Kickoff', resourceLabel: 'Amy', status: '' } };
  const d = consultationDiff(exist, [incoming({ resourceLabel: 'Amy, Ben' })], now, { timeMin: now, timeMax: new Date('2026-12-31') });
  expect(d.fieldUpdates[0].fields).toContain('Resource');
});

test('missing future event is cancelled not deleted', () => {
  const exist = { e1: { eventId: 'e1', start: future, end: futureEnd, milestone: 'Kickoff', resourceLabel: 'Amy', status: '' } };
  const d = consultationDiff(exist, [], now, { timeMin: now, timeMax: new Date('2026-12-31') });
  expect(d.cancellations).toEqual(['e1']);
});

test('past row outside window is not cancelled', () => {
  const past = new Date('2026-09-01T09:00:00Z');
  const exist = { e1: { eventId: 'e1', start: past, end: new Date('2026-09-01T10:00:00Z'), milestone: 'Kickoff', resourceLabel: 'Amy', status: '' } };
  const d = consultationDiff(exist, [], now, { timeMin: new Date('2026-09-21'), timeMax: new Date('2026-12-31') });
  expect(d.cancellations).toEqual([]);
});
