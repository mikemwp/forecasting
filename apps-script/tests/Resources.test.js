const { indexResources, matchTo, matchFrom, resourceLabel } = require('../src/Resources');

const rows = [
  { email: 'amy@co.com', name: 'Amy', certiniaId: 'R1' },
  { email: 'ben@co.com', name: 'Ben', certiniaId: 'R2' }
];

test('To keeps only listed emails, drops customers, sorts by email', () => {
  const idx = indexResources(rows);
  const m = matchTo(['customer@x.com', 'Ben@co.com', 'amy@co.com'], idx);
  expect(m.map(function (r) { return r.email; })).toEqual(['amy@co.com', 'ben@co.com']);
  expect(resourceLabel(m)).toBe('Amy, Ben');
});

test('From looks up organizer; missing is null', () => {
  const idx = indexResources(rows);
  expect(matchFrom('AMY@co.com', idx).certiniaId).toBe('R1');
  expect(matchFrom('pm@elsewhere.com', idx)).toBeNull();
});

test('organizer is not added to To unless also an attendee', () => {
  const idx = indexResources(rows);
  const m = matchTo(['customer@x.com'], idx);
  expect(m).toEqual([]);
});
