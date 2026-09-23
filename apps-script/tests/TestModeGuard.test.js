const { chooseClients, dailyTriggerAllowed, assertNoLiveFetch, resolveImportRunner, resolveCreateRRRunner } = require('../src/Menu');

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

test('live factory throws if accidentally invoked under TEST_MODE path', () => {
  var harness = { kind: 'harness' };
  var liveFactory = function () {
    throw new Error('live factory should not run');
  };
  expect(chooseClients(true, harness, liveFactory)).toBe(harness);
});

test('resolveImportRunner uses harness when TEST_MODE true', () => {
  var harnessCalled = false;
  var liveCalled = false;
  resolveImportRunner(
    true,
    function () { harnessCalled = true; },
    function () { liveCalled = true; }
  )();
  expect(harnessCalled).toBe(true);
  expect(liveCalled).toBe(false);
});

test('resolveImportRunner uses live when TEST_MODE false', () => {
  var harnessCalled = false;
  var liveCalled = false;
  resolveImportRunner(
    false,
    function () { harnessCalled = true; },
    function () { liveCalled = true; }
  )();
  expect(harnessCalled).toBe(false);
  expect(liveCalled).toBe(true);
});

test('resolveCreateRRRunner uses harness when TEST_MODE true', () => {
  var harnessCalled = false;
  var liveCalled = false;
  resolveCreateRRRunner(
    true,
    function () { harnessCalled = true; },
    function () { liveCalled = true; }
  )();
  expect(harnessCalled).toBe(true);
  expect(liveCalled).toBe(false);
});

test('resolveCreateRRRunner uses live when TEST_MODE false', () => {
  var harnessCalled = false;
  var liveCalled = false;
  resolveCreateRRRunner(
    false,
    function () { harnessCalled = true; },
    function () { liveCalled = true; }
  )();
  expect(harnessCalled).toBe(false);
  expect(liveCalled).toBe(true);
});
