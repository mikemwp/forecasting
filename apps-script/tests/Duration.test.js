const { durationHours } = require('../src/Duration');

test('90 minutes is 1.5 hours', () => {
  const s = new Date('2026-09-23T09:00:00Z');
  const e = new Date('2026-09-23T10:30:00Z');
  expect(durationHours(s, e, false)).toEqual({ ok: true, hours: 1.5 });
});

test('all-day is rejected', () => {
  const r = durationHours(new Date(), new Date(), true);
  expect(r.ok).toBe(false);
});
