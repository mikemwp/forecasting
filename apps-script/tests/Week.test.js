const { weekStart, fetchWindow } = require('../src/Week');

test('Monday week start from Wednesday', () => {
  const wed = new Date('2026-09-23T12:00:00+01:00');
  const start = weekStart(wed, 'Monday');
  expect(start.getDay()).toBe(1);
  expect(start.getHours()).toBe(0);
});

test('fetch window starts at week start not now', () => {
  const now = new Date('2026-09-23T12:00:00Z');
  const w = fetchWindow(now, 90, 'Monday');
  expect(w.timeMin.getTime()).toBeLessThan(now.getTime());
  expect(w.timeMax.getTime()).toBeGreaterThan(now.getTime());
});
