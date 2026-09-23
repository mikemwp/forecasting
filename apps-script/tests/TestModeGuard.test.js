const { chooseClients, dailyTriggerAllowed, assertNoLiveFetch } = require('../src/Menu');

test('chooseClients(true) returns harness', () => {
  var harness = { kind: 'harness' };
  var live = { kind: 'live' };
  expect(chooseClients(true, harness, live)).toBe(harness);
});

test('chooseClients(false) returns live', () => {
  var harness = { kind: 'harness' };
  var live = { kind: 'live' };
  expect(chooseClients(false, harness, live)).toBe(live);
});

test('dailyTriggerAllowed(false) when TEST_MODE true', () => {
  expect(dailyTriggerAllowed(true)).toBe(false);
});

test('dailyTriggerAllowed(true) when TEST_MODE false', () => {
  expect(dailyTriggerAllowed(false)).toBe(true);
});

test('assertNoLiveFetch throws if live client used in TEST_MODE', () => {
  expect(function () {
    assertNoLiveFetch(true, { urlFetch: function () {} });
  }).toThrow(/TEST_MODE/);
});

test('chooseClients with factory does not invoke factory in TEST_MODE', () => {
  var calls = 0;
  function factory() { calls++; return { kind: 'live' }; }
  expect(chooseClients(true, { kind: 'harness' }, factory).kind).toBe('harness');
  expect(calls).toBe(0);
});

test('chooseClients with factory invokes factory when live mode', () => {
  var calls = 0;
  function factory() { calls++; return { kind: 'live' }; }
  expect(chooseClients(false, { kind: 'harness' }, factory).kind).toBe('live');
  expect(calls).toBe(1);
});
