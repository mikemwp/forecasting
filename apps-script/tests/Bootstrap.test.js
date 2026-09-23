const { importDummyData } = require('../src/Bootstrap');
const { MemoryWorkbook } = require('../src/SheetIO');
const { Config } = require('../src/Config');

test('importDummyData on empty workbook creates all tabs and fixtures', () => {
  var wb = new MemoryWorkbook();
  importDummyData(wb);
  expect(wb.getTab(Config.tabs.resourceEmails).rows.length).toBeGreaterThan(0);
  expect(wb.getColumnValues(Config.tabs.resourceEmails, 'Email')).toContain('mikemwp@gmail.com');
  expect(wb.getTab(Config.tabs.companies).rows.length).toBe(1);
  expect(wb.getTab('CS_P-DEMO').headers).toEqual(Config.consultationHeaders);
  expect(wb.getTab(Config.tabs.calendarSeed).rows.length).toBe(10);
  expect(wb.getTab(Config.tabs.forecast).rows.length).toBeGreaterThan(0);
});

test('second importDummyData does not duplicate companies or seed rows', () => {
  var wb = new MemoryWorkbook();
  importDummyData(wb);
  importDummyData(wb);
  expect(wb.getTab(Config.tabs.companies).rows.length).toBe(1);
  expect(wb.getTab(Config.tabs.calendarSeed).rows.length).toBe(10);
});

test('importDummyData works when require is undefined (GAS seed fallback)', () => {
  var bootstrapSrc = require('fs').readFileSync(require('path').join(__dirname, '../src/Bootstrap.js'), 'utf8');
  expect(bootstrapSrc).toMatch(/typeof require !== 'undefined'\s*\?\s*require\('\.\/CalendarSeed'\)/);
  expect(bootstrapSrc).toMatch(/defaultSeedRows/);
  expect(bootstrapSrc).not.toMatch(/require\('\.\/CalendarSeed'\)\s*;\s*$/m);
});
