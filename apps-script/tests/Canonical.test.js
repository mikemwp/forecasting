const { canonicalize } = require('../src/Canonical');

test('matches case-insensitive and returns canonical spelling', () => {
  expect(canonicalize(' kickoff ', ['Discovery', 'Kickoff'])).toBe('Kickoff');
});

test('unknown returns null', () => {
  expect(canonicalize('Kick off', ['Kickoff'])).toBeNull();
});
