const { parseDescription } = require('../src/ParseDescription');

test('parses four pipe segments', () => {
  const r = parseDescription('Acme Ltd|Kickoff call|Kickoff|a0B000000000001');
  expect(r.ok).toBe(true);
  expect(r.company).toBe('Acme Ltd');
  expect(r.meetingTitle).toBe('Kickoff call');
  expect(r.milestone).toBe('Kickoff');
  expect(r.projectId).toBe('a0B000000000001');
});

test('rejects wrong segment count', () => {
  const r = parseDescription('only|two');
  expect(r.ok).toBe(false);
  expect(r.error).toMatch(/segments/i);
});

test('rejects empty project id', () => {
  const r = parseDescription('Acme|Title|Kickoff|');
  expect(r.ok).toBe(false);
});

test('trims whitespace', () => {
  const r = parseDescription(' Acme | Title | Kickoff | a0B000000000001 ');
  expect(r.ok).toBe(true);
  expect(r.company).toBe('Acme');
});
