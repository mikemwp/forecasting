function createInspector() {
  var calls = [];
  return {
    calls: calls,
    record: function (call) {
      calls.push({
        timestamp: call.timestamp || new Date().toISOString(),
        job: call.job,
        dryRun: !!call.dryRun,
        system: call.system,
        operation: call.operation,
        method: call.method,
        path: call.path,
        requestJson: typeof call.request === 'string' ? call.request : JSON.stringify(call.request, null, 2),
        fakeResponseJson: typeof call.fakeResponse === 'string' ? call.fakeResponse : JSON.stringify(call.fakeResponse || { success: true, id: 'harness_' + calls.length }, null, 2),
        notes: call.notes || ''
      });
    },
    asRows: function () {
      return calls.map(function (c) {
        return [c.timestamp, c.job, c.dryRun, c.system, c.operation, c.method, c.path, c.requestJson, c.fakeResponseJson, c.notes];
      });
    }
  };
}
if (typeof module !== 'undefined') module.exports = { createInspector: createInspector };
