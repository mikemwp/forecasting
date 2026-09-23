const { renderForecastGrid } = require('../src/PlannerPreview');

test('project rollup then resource rows with summed week hours', () => {
  const now = new Date('2026-09-23T12:00:00Z');
  const mon = new Date('2026-09-28T10:00:00Z');
  const tue = new Date('2026-09-29T10:00:00Z');
  const grid = renderForecastGrid([
    { projectId: 'P-DEMO', company: 'Acme Ltd', resourceName: 'Mike', date: mon, hours: 1 },
    { projectId: 'P-DEMO', company: 'Acme Ltd', resourceName: 'Mike', date: tue, hours: 1 }
  ], now, 'Monday');
  expect(grid.banner).toMatch(/Project Planner \(PM\)/);
  expect(grid.banner).toMatch(/In Progress/);
  expect(grid.headers[0]).toBe('▾ Project ID');
  expect(grid.headers[1]).toBe('Customer');
  expect(grid.headers[2]).toBe('Resource');
  expect(grid.headers[3]).toBe('Total hrs');
  const weekCol = grid.headers.indexOf('28 Sep 2026');
  expect(weekCol).toBeGreaterThan(3);
  expect(grid.rows[0][0]).toBe('P-DEMO');
  expect(grid.rows[0][2]).toBe('(all)');
  expect(grid.rows[0][3]).toBe(2);
  expect(grid.rows[0][weekCol]).toBe(2);
  expect(grid.rows[1][2]).toBe('Mike');
  expect(grid.rows[1][weekCol]).toBe(2);
});

test('two resources appear as chevron children', () => {
  const now = new Date('2026-09-23T12:00:00Z');
  const d = new Date('2026-09-28T10:00:00Z');
  const grid = renderForecastGrid([
    { projectId: 'P-DEMO', company: 'Acme Ltd', resourceName: 'Amy', date: d, hours: 1 },
    { projectId: 'P-DEMO', company: 'Acme Ltd', resourceName: 'Mike', date: d, hours: 1 }
  ], now, 'Monday');
  expect(grid.rows.map(function (r) { return r[2]; })).toEqual(['(all)', 'Amy', 'Mike']);
  expect(grid.rows[0][3]).toBe(2);
});

test('empty week cell is empty string not zero', () => {
  const now = new Date('2026-09-23T12:00:00Z');
  const d = new Date('2026-10-05T10:00:00Z');
  const grid = renderForecastGrid([
    { projectId: 'P-DEMO', company: 'Acme Ltd', resourceName: 'Mike', date: d, hours: 1 }
  ], now, 'Monday');
  const firstWeek = grid.headers[4];
  expect(firstWeek).toBe('21 Sep 2026');
  expect(grid.rows[1][4]).toBe('');
});
